"""Native contracts with synthetic bytes only; no serial, network or proprietary fixture."""
import copy
from contextlib import redirect_stdout, redirect_stderr
import io
import json
from pathlib import Path
import runpy
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import beta_tools as beta
import radio_safety as safety


class NativeProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.real_codec, cls.loader = beta.libraries()
        release = beta.read_json(beta.DEFAULT_RELEASE)
        cls.app = (beta.DEFAULT_RELEASE.parent / release["application"]["file"]).read_bytes()
        cls.contracts, cls.fixtures = {}, {}
        # Keep the production segment sizes, entry points and relocation sites.
        # Only payload bytes and their corresponding exact hashes are synthetic.
        for seed, (identifier, original) in enumerate(beta.SUPPORTED_NATIVE_CODECS.items(), 1):
            contract = copy.deepcopy(original)
            code = bytearray((i * 17 + seed) & 255 for i in range(contract["code_bytes"]))
            struct.pack_into("<2I", code, 0, 0x152514D8, 0x74C776CD)
            refs = [(off, contract["run"] + 0x100 + i * 4) for i, off in enumerate(contract["relocations"])]
            for off, value in refs:
                struct.pack_into("<I", code, off, value)
            code = bytes(code)
            tables = bytes((i * 7 + seed) & 255 for i in range(contract["tables_bytes"]))
            contract.update(code_sha256=safety.digest(code), tables_sha256=safety.digest(tables))
            profile = {"name": "Synthetic " + identifier, "board": "dm32", "tag": contract["stock_tag"],
                       "code": (0x030C0000, len(code), contract["run"]),
                       "tables": (0x03070000, len(tables), contract["tables_ram"]),
                       "entries": dict(contract["entries"])}
            codec_map = next(iter(cls.real_codec["synthetic_map"](profile, code, refs).values()))
            codec_map["profile"] = identifier
            maps = {identifier: codec_map}
            codec = dict(cls.real_codec)
            codec["extract"] = lambda *a, p=profile, c=code, t=tables, **kw: (copy.deepcopy(p), c, t)
            codec["codec_map"] = lambda c, m=maps: cls.real_codec["codec_map"](c, m)
            codec["merge"] = lambda app, p, c, t, m=maps: cls.real_codec["merge"](app, p, c, t, m)
            cls.contracts[identifier] = contract
            cls.fixtures[identifier] = (profile, code, tables, codec)

    def setUp(self):
        patched = patch.object(beta, "SUPPORTED_NATIVE_CODECS", self.contracts)
        patched.start()
        self.addCleanup(patched.stop)

    def test_all_four_exact_layouts_merge_parse_and_wrap(self):
        for identifier, (profile, code, tables, codec) in self.fixtures.items():
            with self.subTest(profile=identifier):
                merged, wrapped, parsed, _ = beta.merge_qualified(self.app, b"synthetic-program", codec, self.loader)
                self.assertEqual(merged[:len(self.app)], self.app)
                self.assertEqual(parsed["run"], self.contracts[identifier]["run"])
                self.assertEqual(parsed["tables_ram"], self.contracts[identifier]["tables_ram"])
                self.assertEqual(parsed["relocations"], self.contracts[identifier]["relocations"])
                self.assertEqual(parsed["length"], self.contracts[identifier]["slot_bytes"])
                self.assertEqual(self.loader["unwrap"](wrapped, self.loader["MODELS"]["dm32"]), (merged, "vendor"))

    def test_altered_code_and_tables_are_rejected_before_merge(self):
        profile, code, tables, codec = self.fixtures["dm32-046"]
        for changed_code, changed_tables, message in ((b"?" + code[1:], tables, "Unsupported"),
                (code, b"?" + tables[1:], "table hash")):
            with self.subTest(message=message):
                mock = dict(codec, extract=lambda *a, **kw: (profile, changed_code, changed_tables))
                mock["merge"] = lambda *a: self.fail("Untrusted native bytes reached merge")
                with self.assertRaisesRegex(ValueError, message):
                    beta.merge_qualified(self.app, b"synthetic", mock, self.loader)

    def test_profile_entries_lengths_addresses_tag_and_map_are_exact(self):
        profile, code, tables, codec = self.fixtures["dm32-046"]
        mutations = []
        for segment in ("code", "tables"):
            for index in (1, 2):
                changed = copy.deepcopy(profile)
                values = list(changed[segment]);values[index] += 4;changed[segment] = tuple(values)
                mutations.append(changed)
        for key, value in (("board", "another-radio"), ("tag", 49)):
            changed = copy.deepcopy(profile);changed[key] = value;mutations.append(changed)
        for entry in profile["entries"]:
            changed = copy.deepcopy(profile);changed["entries"][entry] += 2;mutations.append(changed)
        for changed in mutations:
            mock = dict(codec, extract=lambda *a, **kw: (changed, code, tables))
            mock["merge"] = lambda *a: self.fail("Changed native layout reached merge")
            with self.assertRaisesRegex(ValueError, "layout/entry placement"):
                beta.merge_qualified(self.app, b"synthetic", mock, self.loader)
        changed_map = copy.deepcopy(codec["codec_map"](code))
        changed_map["self_refs"][0]["off"] += 4
        mock = dict(codec, codec_map=lambda *a: changed_map)
        with self.assertRaisesRegex(ValueError, "relocation map"):
            beta.merge_qualified(self.app, b"synthetic", mock, self.loader)

    def test_merged_header_entries_crc_hash_and_application_are_rechecked(self):
        _, _, _, codec = self.fixtures["dm32-046"]
        original_merge = codec["merge"]
        def changed(field=None, code_byte=False, app_byte=False):
            def merge(*args):
                raw = bytearray(original_merge(*args))
                if field is not None:
                    at = beta.SLOT_OFFSET + field * 4
                    struct.pack_into("<I", raw, at, struct.unpack_from("<I", raw, at)[0] + 2)
                if code_byte:raw[beta.SLOT_OFFSET + 128 + 200] ^= 1
                if app_byte:raw[0] ^= 1
                return bytes(raw)
            return merge
        for corrupt in (changed(field=8), changed(field=7), changed(code_byte=True), changed(app_byte=True)):
            with self.assertRaisesRegex(ValueError, "slot|contract|application"):
                beta.merge_qualified(self.app, b"synthetic", dict(codec, merge=corrupt), self.loader)

    def test_release_contracts_cannot_be_unknown_changed_or_duplicated(self):
        manifest = {"supported_native_codecs": beta.native_contract_records()}
        self.assertEqual(beta.release_supported_codecs(manifest), set(self.contracts))
        for key, value in (("id", "unknown"), ("code_bytes", 123), ("run", 4)):
            changed = copy.deepcopy(manifest);changed["supported_native_codecs"][0][key] = value
            with self.assertRaisesRegex(ValueError, "contract differs"):
                beta.release_supported_codecs(changed)
        changed = copy.deepcopy(manifest);changed["supported_native_codecs"].append(changed["supported_native_codecs"][0])
        with self.assertRaisesRegex(ValueError, "repeats"):
            beta.release_supported_codecs(changed)
        with self.assertRaisesRegex(ValueError, "declare"):
            beta.release_supported_codecs({})
        with self.assertRaisesRegex(ValueError, "list exact"):
            beta.release_supported_codecs({"supported_native_codecs": []})

    def test_historical_release_stays_nrf_only(self):
        nrf = self.contracts["dm32-nrf-049"]
        old = {"qualified_native_codec": {key: nrf[key] for key in ("code_sha256", "tables_sha256")}}
        allowed = beta.release_supported_codecs(old)
        self.assertEqual(allowed, {"dm32-nrf-049"})
        for identifier, (_, _, _, codec) in self.fixtures.items():
            if identifier == "dm32-nrf-049":
                beta.merge_qualified(self.app, b"synthetic", codec, self.loader, allowed, "0.1.0-beta.1")
            else:
                with self.assertRaisesRegex(ValueError, "not declared for release 0.1"):
                    beta.merge_qualified(self.app, b"synthetic", codec, self.loader, allowed, "0.1.0-beta.1")

    def test_prepare_reuses_exact_version_and_preserves_old_package(self):
        _, _, _, codec = self.fixtures["dm32-046"]
        with tempfile.TemporaryDirectory(prefix="dm32-beta-profile-test-") as temporary:
            root = Path(temporary);release_dir = root / "firmware/test";release_dir.mkdir(parents=True)
            manifest = {"schema": "dm32-multimode-release/1", "board": "dm32", "version": "0.2.0-beta.1",
                        "source_commit": "1" * 40, "supported_native_codecs": beta.native_contract_records(),
                        "application": {"file": "app.bin", **beta.record(self.app)}}
            release = release_dir / "release.json";release.write_text(json.dumps(manifest));(release_dir / "app.bin").write_bytes(self.app)
            label = "synthetic-radio";old = root / "build" / label / "package.json";old.parent.mkdir(parents=True);old.write_bytes(b"legacy package preserved")
            with patch.object(beta, "ROOT", root), patch.object(beta, "libraries", return_value=(codec, self.loader)), \
                    patch.object(safety, "validate", return_value=(b"synthetic program", b"synthetic data")):
                package = beta.prepare(root / "backup", label, release)
                self.assertEqual(package, old.parent / manifest["version"] / "package.json")
                self.assertEqual(beta.default_package_path(label, release), package)
                before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in package.parent.iterdir()}
                self.assertEqual(beta.prepare(root / "backup", label, release), package)
                self.assertEqual(before, {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in package.parent.iterdir()})
                self.assertEqual(old.read_bytes(), b"legacy package preserved")
                with self.assertRaisesRegex(ValueError, "never overwrite"):
                    beta.prepare(root / "backup", "another-label", release, package.parent)
                target = package.parent / beta.VENDOR_NAME;target.write_bytes(b"damaged")
                with self.assertRaisesRegex(ValueError, "never overwrite"):
                    beta.prepare(root / "backup", label, release)
                self.assertEqual(target.read_bytes(), b"damaged")

    def test_codec_info_and_cli_are_read_only(self):
        _, _, _, codec = self.fixtures["dm32-046"]
        manifest = {"version": "test", "supported_native_codecs": beta.native_contract_records()}
        with patch.object(safety, "validate", return_value=(b"synthetic", b"data")), \
                patch.object(beta, "libraries", return_value=(codec, self.loader)), \
                patch.object(beta, "read_json", return_value=manifest), patch.object(safety, "dump") as dump:
            info = beta.codec_info(Path("unused"), "synthetic-radio")
            self.assertTrue(info["supported_by_tools"] and info["allowed_by_release"])
            self.assertFalse(info["hardware_accessed"])
            main = runpy.run_path(str(ROOT / "tools/prepare-firmware.py"))["main"]
            argv = ["prepare-firmware.py", "codec-info", "--backup", "unused", "--radio-label", "synthetic-radio", "--json"]
            with patch.object(sys, "argv", argv), io.StringIO() as output, redirect_stdout(output):
                main();self.assertEqual(json.loads(output.getvalue())["contract"], "dm32-046")
            dump.assert_not_called()

    def test_missing_pyserial_has_actionable_cli_error(self):
        missing = ModuleNotFoundError("No module named serial", name="serial")
        cases = (("prepare-firmware.py", beta, "prepare", []),
                 ("flash-firmware.py", safety, "tools", ["restore"]),
                 ("radio-safety.py", safety, "main", []))
        for script, module, target, action in cases:
            with self.subTest(script=script):
                argv = [script, *action, "--backup", "unused", "--radio-label", "synthetic-radio"]
                with patch.object(sys, "argv", argv), patch.object(module, target, side_effect=missing), \
                        io.StringIO() as output, redirect_stderr(output):
                    with self.assertRaises(SystemExit) as error:
                        runpy.run_path(str(ROOT / "tools" / script), run_name="__main__")
                    self.assertEqual(error.exception.code, 1)
                    self.assertIn("-m pip install -r", output.getvalue())
                    self.assertIn("requirements.txt", output.getvalue())
                    self.assertNotIn("Traceback", output.getvalue())

    def test_unqualified_execute_stops_before_any_reader_or_updater(self):
        main = runpy.run_path(str(ROOT / "tools/flash-firmware.py"))["main"]
        argv = ["flash-firmware.py", "flash", "--backup", "unused", "--radio-label", "synthetic-radio", "--port", "NO_PORT", "--execute"]
        with patch.object(sys, "argv", argv), \
                patch.object(beta, "validated_package", side_effect=beta.NativeCodecError("Unsupported native codec")), \
                patch.object(safety, "dump") as dump, patch("subprocess.run") as updater:
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                main()
            dump.assert_not_called();updater.assert_not_called()


if __name__ == "__main__":unittest.main()
