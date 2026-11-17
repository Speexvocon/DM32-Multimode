"""Prevent local CRLF checksums from changing when Git publishes LF text."""
import hashlib
from pathlib import Path
import runpy
import tempfile
import unittest


CHECKER = runpy.run_path(str(Path(__file__).resolve().parents[1] / "tools/check-release.py"))


class ReleaseChecksumTests(unittest.TestCase):
    def check_fixture(self, content, list_newline=b"\n"):
        with tempfile.TemporaryDirectory(prefix="dm32-release-checksums-") as temporary:
            root = Path(temporary).resolve()
            target = root / "manifest.json"
            target.write_bytes(content)
            path = root / "SHA256SUMS"
            checksum = hashlib.sha256(content).hexdigest()
            path.write_bytes(checksum.encode() + b"  manifest.json" + list_newline)
            check = CHECKER["checksum_file"]
            previous = check.__globals__["ROOT"]
            check.__globals__["ROOT"] = root
            try:
                return check(path)
            finally:
                check.__globals__["ROOT"] = previous

    def test_lf_manifest_and_checksum_list_pass(self):
        content = b'{"schema":"synthetic"}\n'
        self.assertEqual(self.check_fixture(content), {"manifest.json": hashlib.sha256(content).hexdigest()})

    def test_matching_local_crlf_manifest_hash_is_refused(self):
        # It would match locally, then fail after Git's eol=lf publication.
        with self.assertRaisesRegex(ValueError, "Hashed text must use canonical LF"):
            self.check_fixture(b'{"schema":"synthetic"}\r\n')

    def test_crlf_checksum_list_is_refused(self):
        with self.assertRaisesRegex(ValueError, "Checksum lists must use canonical LF"):
            self.check_fixture(b'{"schema":"synthetic"}\n', b"\r\n")


if __name__ == "__main__":
    unittest.main()
