"""Offline tests only: no radio, serial transport, network or proprietary bytes."""
import copy
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import beta_tools as beta
import radio_safety as safety


class BetaToolsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="dm32-beta-tests-")
        cls.base = Path(cls.temporary.name)
        cls.backup = cls.base / "backup"
        cls.label = "synthetic-radio"
        program = bytearray([0xAA]) * safety.PROGRAM_SIZE
        data = bytearray([0xFF]) * safety.DATA_SIZE
        data[0x1FFF] = 2  # One synthetic factory-tagged calibration page.
        cls.original = bytes(program), bytes(data)
        for directory in (cls.backup, cls.backup / "readback"):
            directory.mkdir(parents=True)
            (directory / "program.bin").write_bytes(program)
            (directory / "data.bin").write_bytes(data)
        safety.seal(cls.backup, cls.label, "synthetic fixture, never a real radio")
        cls.codec, cls.loader = beta.libraries()
        cls.release_root = cls.base / "release-repo"
        cls.release_dir = cls.release_root / "firmware/test"
        cls.release_dir.mkdir(parents=True)
        # The redistributable application has no native codec. No private bytes used.
        real = json.loads(beta.DEFAULT_RELEASE.read_text(encoding="utf-8"))
        cls.app = (beta.DEFAULT_RELEASE.parent / real["application"]["file"]).read_bytes()
        (cls.release_dir / "app.bin").write_bytes(cls.app)
        cls.manifest = {"schema": "dm32-multimode-release/1", "board": "dm32", "version": "test",
                        "source_commit": "1" * 40, "application": {"file": "app.bin", **beta.record(cls.app)}}
        cls.release = cls.release_dir / "release.json"
        cls.release.write_text(json.dumps(cls.manifest), encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_sealed_backup_rejects_wrong_label_and_corruption(self):
        self.assertEqual(safety.validate(self.backup, self.label), self.original)
        with self.assertRaisesRegex(ValueError, "label"):
            safety.validate(self.backup, "other-radio")
        path = self.backup / "readback/program.bin"
        changed = bytearray(self.original[0])
        changed[0xF000] ^= 1
        path.write_bytes(changed)
        try:
            with self.assertRaisesRegex(ValueError, "mismatch"):
                safety.validate(self.backup, self.label)
        finally:
            path.write_bytes(self.original[0])

    def test_backup_plan_does_not_open_port_or_create_directory(self):
        target = self.base / "not-created"
        argv = ["radio-safety.py", "backup", "--directory", str(target), "--radio-label", self.label,
                "--firmware", "synthetic", "--port", "NO_SUCH_COM_PORT"]
        with patch.object(sys, "argv", argv), patch.object(safety, "dump") as dump:
            safety.main()
        dump.assert_not_called()
        self.assertFalse(target.exists())

    def test_native_codec_variant_is_rejected_before_merge(self):
        codec = {"extract": lambda *a, **kw: ({"code": (0, 1, 0), "tables": (0, 1, 0)}, b"bad", b"bad"),
                 "merge": lambda *a: self.fail("unsupported native codec must never merge")}
        with self.assertRaisesRegex(ValueError, "not qualified"):
            beta.merge_qualified(self.app, self.original[0], codec, self.loader)

    def test_qualified_hashes_do_not_bypass_placement_check(self):
        codec = {"extract": lambda *a, **kw: ({"code": (0, 1, 0x16CDC), "tables": (0, 1, 0xDEADBEEF)}, b"code", b"tables")}
        with patch.object(safety, "digest", side_effect=[beta.QUALIFIED_CODE, beta.QUALIFIED_TABLES]):
            with self.assertRaisesRegex(ValueError, "placement"):
                beta.merge_qualified(self.app, self.original[0], codec, self.loader)

    def test_release_hash_and_path_traversal_are_refused(self):
        with patch.object(beta, "ROOT", self.release_root):
            self.assertEqual(beta.release_application(self.release, self.loader)[2], self.app)
            for value in ("../app.bin", "../../outside.bin"):
                manifest = copy.deepcopy(self.manifest)
                manifest["application"]["file"] = value
                self.release.write_text(json.dumps(manifest), encoding="utf-8")
                try:
                    with self.assertRaisesRegex(ValueError, "filename"):
                        beta.release_application(self.release, self.loader)
                finally:
                    self.release.write_text(json.dumps(self.manifest), encoding="utf-8")
            manifest = copy.deepcopy(self.manifest)
            manifest["application"]["sha256"] = "0" * 64
            self.release.write_text(json.dumps(manifest), encoding="utf-8")
            try:
                with self.assertRaisesRegex(ValueError, "SHA-256"):
                    beta.release_application(self.release, self.loader)
            finally:
                self.release.write_text(json.dumps(self.manifest), encoding="utf-8")

    def test_preparation_and_package_binding_without_native_bytes(self):
        # Mock only the proprietary merge; test every surrounding file/binding guard.
        merged, wrapped, parsed = self.app + b"SYNTHETIC-SLOT", b"SYNTHETIC-VENDOR", {"synthetic": True}
        destination = self.release_root / "build/prepared"
        with patch.object(beta, "ROOT", self.release_root), \
                patch.object(beta, "libraries", return_value=(self.codec, self.loader)), \
                patch.object(beta, "merge_qualified", return_value=(merged, wrapped, parsed, [])):
            package = beta.prepare(self.backup, self.label, self.release, destination)
            self.assertEqual(beta.validated_package(package, self.backup, self.label)[1], merged)
            with self.assertRaisesRegex(ValueError, "never overwrite"):
                beta.prepare(self.backup, self.label, self.release, destination)
            with self.assertRaisesRegex(ValueError, "inside build"):
                beta.prepare(self.backup, self.label, self.release, self.base / "outside")
            original_json = package.read_bytes()
            manifest = json.loads(original_json)
            manifest["radio_label"] = "other-radio"
            package.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "bound"):
                beta.validated_package(package, self.backup, self.label)
            package.write_bytes(original_json)
            (destination / beta.RAW_NAME).write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "mismatch"):
                beta.validated_package(package, self.backup, self.label)

    def test_verify_new_application_not_original_and_protect_calibration(self):
        merged = b"NEW BETA APPLICATION"
        program = bytearray(self.original[0])
        program[safety.APP_START:safety.APP_START + len(merged)] = merged
        installed = bytes(program), self.original[1]
        self.assertTrue(beta.verify_installed(installed, self.original, merged)["application_matches"])
        with self.assertRaisesRegex(ValueError, "application differs"):
            beta.verify_installed(self.original, self.original, merged)
        program[0x20] ^= 1
        with self.assertRaisesRegex(ValueError, "Bootloader or calibration"):
            beta.verify_installed((bytes(program), self.original[1]), self.original, merged)
        data = bytearray(self.original[1])
        data[0x1010] ^= 1
        with self.assertRaisesRegex(ValueError, "Bootloader or calibration"):
            beta.verify_installed((installed[0], bytes(data)), self.original, merged)

    def test_flash_and_readback_default_offline_even_with_invalid_port(self):
        main = runpy.run_path(str(ROOT / "tools/flash-firmware.py"))["main"]
        for action in ("flash", "verify-installed", "restore"):
            argv = ["flash-firmware.py", action, "--backup", str(self.backup), "--radio-label", self.label,
                    "--port", "NO_SUCH_COM_PORT"]
            package = {"version": "test", "source_commit": "1" * 40}
            with patch.object(sys, "argv", argv), \
                    patch.object(beta, "validated_package", return_value=(package, self.app, self.original)), \
                    patch.object(safety, "dump") as dump, patch.object(subprocess, "run") as dispatch:
                main()
            dump.assert_not_called()
            dispatch.assert_not_called()

    def test_execute_requires_explicit_port_before_reader(self):
        main = runpy.run_path(str(ROOT / "tools/flash-firmware.py"))["main"]
        package = {"version": "test", "source_commit": "1" * 40}
        argv = ["flash-firmware.py", "flash", "--backup", str(self.backup), "--radio-label", self.label, "--execute"]
        with patch.object(sys, "argv", argv), \
                patch.object(beta, "validated_package", return_value=(package, self.app, self.original)), \
                patch.object(safety, "dump") as dump:
            with self.assertRaises(SystemExit) as error:
                main()
        self.assertEqual(error.exception.code, 2)
        dump.assert_not_called()

    def test_vendored_imports_and_integrity(self):
        stub, loader = safety.tools()
        library = runpy.run_path(str(loader))
        self.assertEqual(library["MODELS"]["dm32"].magic, b"BFUV32-V2")
        self.assertEqual(self.codec["BOARDS"]["dm32"]["slot"][0], 0x030E8000)
        imported = runpy.run_path(str(stub))
        self.assertIn("dm32", imported["C7_BOARDS"])

    def test_vendor_tampering_and_import_shadow_files_are_refused(self):
        root = self.base / "vendor-test"
        vendor = root / "tools/vendor/RadioFoundry"
        vendor.mkdir(parents=True)
        source = vendor / "sample.py"
        source.write_bytes(b"# pinned synthetic tool\n")
        manifest = {"schema": "dm32-vendored-tools/1", "commit": safety.PIN,
                    "files": {"sample.py": beta.record(source.read_bytes())}}
        (root / "tools/vendor-radiofoundry.json").write_text(json.dumps(manifest), encoding="utf-8")
        with patch.object(safety, "ROOT", root), patch.object(safety, "UPSTREAM", vendor):
            safety.tools()
            source.write_bytes(b"# altered\n")
            with self.assertRaisesRegex(ValueError, "checksum"):
                safety.tools()
            source.write_bytes(b"# pinned synthetic tool\n")
            (vendor / "serial.py").write_bytes(b"# unexpected import shadow\n")
            with self.assertRaisesRegex(ValueError, "unexpected"):
                safety.tools()

    def test_preservation_mismatch_prevents_updater_dispatch(self):
        main = runpy.run_path(str(ROOT / "tools/flash-firmware.py"))["main"]
        package = {"version": "test", "source_commit": "1" * 40}
        changed = bytearray(self.original[0])
        changed[0] ^= 1
        argv = ["flash-firmware.py", "flash", "--backup", str(self.backup), "--radio-label", self.label,
                "--execute", "--port", "FAKE_PORT"]
        with patch.object(sys, "argv", argv), \
                patch.object(beta, "validated_package", return_value=(package, self.app, self.original)), \
                patch.object(safety, "dump", return_value=(bytes(changed), self.original[1])), \
                patch.object(subprocess, "run") as dispatch:
            with self.assertRaisesRegex(ValueError, "Bootloader or calibration"):
                main()
        dispatch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
