"""Guarded beta flash, independent readback, and own-application recovery."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import runpy
import subprocess
import sys

import beta_tools as beta
import radio_safety as safety


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("flash", "verify-installed", "restore"))
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--radio-label", required=True)
    parser.add_argument("--package", type=Path, help="Default: build/<sanitized-radio-label>/package.json")
    parser.add_argument("--port", help="Explicit programming cable COM port; required with --execute")
    parser.add_argument("--execute", action="store_true", help="Allow this hardware operation; default is offline")
    args = parser.parse_args()
    backup = args.backup.resolve()
    stub, loader = safety.tools()
    if args.action == "restore":
        original = safety.validate(backup, args.radio_label)
        image = original[0][safety.APP_START:]
        library = runpy.run_path(str(loader))
        library["check_image"](image, library["MODELS"]["dm32"])
    else:
        package_path = args.package or beta.label_directory(args.radio_label) / "package.json"
        package, image, original = beta.validated_package(package_path, backup, args.radio_label)
        print(f"Validated {package['version']} ({package['source_commit'][:7]}) for {args.radio_label}")
    if not args.execute:
        print("PLAN ONLY: no serial port opened.")
        print("Next: read both complete memories and compare bootloader/calibration with your sealed backup.")
        print("Then independently verify the installed beta." if args.action == "verify-installed" else
              "Then prompt for PTT + SK1 factory update mode and flash only the application.")
        return
    if not args.port or not args.port.strip():
        parser.error("--execute requires an explicit --port")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    readback = backup / (args.action + "-" + stamp)
    print("Use the labeled radio. Switch it OFF, remove/refit the battery if needed, and keep the cable connected.")
    print("Leave it OFF until the RAM reader asks you to turn it ON normally, without holding buttons.")
    current = safety.dump(stub, args.port, readback)
    safety.compare(current, original)
    if args.action == "verify-installed":
        result = beta.verify_installed(current, original, image)
        result.update(radio_label=args.radio_label, verified_utc=datetime.now(timezone.utc).isoformat())
        (readback / "verification.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print("VERIFIED: installed beta, bootloader and factory calibration match.")
    else:
        staged = readback / "validated-application.bin"
        with staged.open("xb") as output:
            output.write(image)
        print("Preservation checks passed. Now enter FACTORY update mode:")
        print("Switch OFF; hold PTT + SK1; switch ON; wait for green LED; release both buttons.")
        subprocess.run([sys.executable, str(loader), "--model", "dm32", str(staged),
                        "--port", args.port], check=True)
        print("Transfer completed. This does not replace independent readback verification.")
    print("Reader is closed. Power-cycle normally to return to the firmware; keep PTT released.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print("flash-firmware: " + str(error), file=sys.stderr)
        sys.exit(1)
