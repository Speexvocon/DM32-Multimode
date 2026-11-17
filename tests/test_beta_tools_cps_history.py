"""Historical release identity survives a newer default CPS bundle; no devices."""
import copy
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

CHECKER = runpy.run_path(str(Path(__file__).resolve().parents[1] / "tools/check-release.py"))
CHECK = CHECKER["check_release_cps"]


class ReleaseCpsHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="dm32-release-cps-history-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        (self.root / "cps").mkdir()
        self.current = self.root / "firmware/v0.3.0-beta.2/release.json"
        self.historical = self.root / "firmware/v0.3.0-beta.1/release.json"
        self.release = {"source_commit": "2" * 40, "cps": {
            "url": "https://speexvocon.github.io/DM32-Studio/", "source_commit": "b" * 40,
            "firmware_source_commit": "2" * 40, "codeplug_version_max": 6}}
        self.old = copy.deepcopy(self.release)
        self.old["source_commit"] = self.old["cps"]["firmware_source_commit"] = "1" * 40
        self.old["cps"]["source_commit"] = "a" * 40
        self.model = (b"export const RECORD_COUNT=499;\n"
                      b"export const TRUNK_SYSTEM_COUNT=8;\n"
                      b"export const TRUNK_CONTROL_COUNT=8;\n")
        (self.root / "cps/model.js").write_bytes(self.model)
        self.deployment = {"source_revision": "b" * 40, "firmware_source_revision": "2" * 40,
            "protocol_versions": [1, 2, 3, 4, 5, 6],
            "assets": {"model.js": hashlib.sha256(self.model).hexdigest()}}
        self.checksums = {"cps/deployment.json": "checked by checksum_file before this gate"}
        self.write_deployment()
        scoped = patch.dict(CHECK.__globals__, ROOT=self.root)
        scoped.start();self.addCleanup(scoped.stop)

    def write_deployment(self):
        (self.root / "cps/deployment.json").write_text(json.dumps(self.deployment), encoding="utf-8")

    def check(self, path=None, release=None):
        CHECK(self.current if path is None else path, self.release if release is None else release,
              6, self.checksums, self.current)

    def test_distinct_historical_metadata_and_current_bundle_both_pass_unchanged(self):
        before = copy.deepcopy(self.old)
        self.check(self.historical, self.old)
        self.check()
        self.assertEqual(self.old, before)

    def test_historical_metadata_still_requires_exact_firmware_cps_and_v6_capability(self):
        for key, value in [("url", "https://example.invalid/"), ("source_commit", "invalid"),
                           ("firmware_source_commit", "3" * 40), ("codeplug_version_max", 5)]:
            with self.subTest(key=key):
                bad = copy.deepcopy(self.old);bad["cps"][key] = value
                with self.assertRaises(ValueError):self.check(self.historical, bad)

    def test_current_bundle_identity_and_protocol_are_still_bound(self):
        for key, value in [("source_revision", "a" * 40), ("firmware_source_revision", "1" * 40),
                           ("protocol_versions", [1, 2, 3, 4, 5])]:
            with self.subTest(key=key):
                original = copy.deepcopy(self.deployment)
                self.deployment[key] = value;self.write_deployment()
                with self.assertRaisesRegex(ValueError, "deployment identity"):self.check()
                self.deployment = original;self.write_deployment()

    def test_current_asset_corruption_path_traversal_and_missing_root_checksum_are_refused(self):
        (self.root / "cps/model.js").write_bytes(self.model + b"corrupt")
        with self.assertRaisesRegex(ValueError, "asset differs"):self.check()
        (self.root / "cps/model.js").write_bytes(self.model)
        self.deployment["assets"] = {"../outside.js": "0" * 64};self.write_deployment()
        with self.assertRaisesRegex(ValueError, "Unsafe CPS"):self.check()
        self.deployment["assets"] = {"model.js": hashlib.sha256(self.model).hexdigest()};self.write_deployment()
        self.checksums.clear()
        with self.assertRaisesRegex(ValueError, "root checksums"):self.check()

    def test_current_matching_hash_cannot_hide_an_obsolete_model(self):
        obsolete = self.model.replace(b"RECORD_COUNT=499", b"RECORD_COUNT=483")
        (self.root / "cps/model.js").write_bytes(obsolete)
        self.deployment["assets"]["model.js"] = hashlib.sha256(obsolete).hexdigest();self.write_deployment()
        with self.assertRaisesRegex(ValueError, "declared V6 capability"):self.check()


if __name__ == "__main__":
    unittest.main()
