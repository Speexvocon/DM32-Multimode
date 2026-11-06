"""Identify native codecs or prepare a private update from a sealed backup, offline."""
import argparse
import json
from pathlib import Path
import sys

import beta_tools as beta


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("prepare", "codec-info"), default="prepare")
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--radio-label", required=True)
    parser.add_argument("--release", type=Path, default=beta.DEFAULT_RELEASE)
    parser.add_argument("--output", type=Path, help="New private directory under build/; never overwritten")
    parser.add_argument("--json", action="store_true", help="Print codec-info as JSON")
    args = parser.parse_args()
    if args.json and args.action != "codec-info":
        parser.error("--json is available for codec-info only")
    if args.output and args.action == "codec-info":
        parser.error("codec-info reads the backup only; it does not accept --output")
    if args.action == "codec-info":
        info = beta.codec_info(args.backup, args.radio_label, args.release)
        if args.json:
            print(json.dumps(info, indent=2))
        else:
            print("Native codec: " + info["profile"])
            print("Supported contract: " + info["contract"])
            print("Code SHA-256: " + info["code_sha256"])
            print("Tables SHA-256: " + info["tables_sha256"])
            print(f"Release {info['release_version']}: " + ("profile supported" if info["allowed_by_release"] else "profile not declared; select a newer compatible release"))
            print(info["validation"])
            print("Offline inspection complete. No package files, serial access or radio writes.")
        return
    package_path = beta.prepare(args.backup, args.radio_label, args.release, args.output)
    package = beta.read_json(package_path)
    contract = next((row for row in beta.SUPPORTED_NATIVE_CODECS.values()
                     if row["code_sha256"] == package["native_codec"].get("code_sha256")), None)
    print("READY: private update package prepared or safely reused after complete revalidation.")
    print(f"Release: {package['version']} / build {package['source_commit'][:7]}")
    if contract:
        print("Native codec: " + contract["name"] + " (" + contract["id"] + ")")
    print("Package: " + str(package_path.resolve()))
    print("Raw update: " + str((package_path.parent / beta.RAW_NAME).resolve()))
    print("Vendor update: " + str((package_path.parent / beta.VENDOR_NAME).resolve()))
    print("Offline checks complete. No radio accessed or flashed. Keep these files and the backup private.")
    print("Next: follow FLASHING.md to review the flash plan before using --execute.")


if __name__ == "__main__":
    try:
        main()
    except ModuleNotFoundError as error:
        print("prepare-firmware: " + beta.safety.dependency_hint(error), file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, TypeError, OSError) as error:
        print("prepare-firmware: " + str(error), file=sys.stderr)
        sys.exit(1)
