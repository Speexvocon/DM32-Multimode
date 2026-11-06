"""DM32 backup and guarded application restore. No hardware access without --execute."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import importlib
from pathlib import Path
import runpy
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "tools/vendor/RadioFoundry"
PIN = "75c46ea46d5ebf6406f5b4ce0bbe2443b7649f91"
PROGRAM_SIZE = 0x100000
DATA_SIZE = 0x1000000
APP_START = 0xC000
COPY_START = 0x710000
HEADER = bytes.fromhex("00400047ffffffff")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_memories(directory, require_application=True):
    program = (directory / "program.bin").read_bytes()
    data = (directory / "data.bin").read_bytes()
    if len(program) != PROGRAM_SIZE or len(data) != DATA_SIZE:
        raise ValueError("Incomplete memory backup: require 1 MB program and 16 MB data")
    if program[:16] in (bytes(16), b"\xff" * 16):
        raise ValueError("Blank bootloader read")
    if require_application and program[APP_START:APP_START+16] in (bytes(16), b"\xff" * 16):
        raise ValueError("Blank application read; not a usable original restore image")
    return program, data


def calibration_files(data):
    # Match the pinned board registry/loader: retain every tagged page, not just
    # the first selected by bf_cal_load(). Raw pages preserve fields/BCD exactly.
    files = {}
    for offset in range(0x1000, 0xC9000, 0x1000):
        page = data[offset:offset+0x1000]
        if page[-1] == 2:
            files[f"calibration/factory-{offset:06x}.bin"] = page
    copy = data[COPY_START:COPY_START+0x1000]
    files["calibration/copy-710000.bin"] = copy
    if len(files) == 1 and copy[:8] != HEADER:
        raise ValueError("No factory-tagged page or recognized calibration copy; refuse flash gate")
    return files


def seal(directory, label, firmware):
    program, data = read_memories(directory)
    if read_memories(directory / "readback") != (program, data):
        raise ValueError("Independent reads differ; backup remains unsealed")
    derived = calibration_files(data)
    derived["restore-application.bin"] = program[APP_START:]
    derived["bootloader-reference.bin"] = program[:APP_START]
    for name, content in derived.items():
        target = directory / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as output:
            output.write(content)
    files = {"program.bin": program, "data.bin": data, **derived}
    files.update({"readback/program.bin": program, "readback/data.bin": data})
    manifest = {"schema": 1, "board": "dm32", "radio_label": label,
                "installed_firmware": firmware, "upstream_commit": PIN,
                "created_utc": datetime.now(timezone.utc).isoformat(),
                "verification": "two-full-reads-identical",
                "files": {name: {"bytes": len(content), "sha256": digest(content)}
                          for name, content in files.items()}}
    with (directory / "manifest.json").open("x", encoding="utf-8") as output:
        json.dump(manifest, output, indent=2)
        output.write("\n")
    return manifest


def validate(directory, label):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if (manifest.get("schema") != 1 or manifest.get("board") != "dm32"
            or manifest.get("upstream_commit") != PIN
            or manifest.get("verification") != "two-full-reads-identical"
            or manifest.get("radio_label") != label):
        raise ValueError("Wrong radio label, board, version or verification record")
    program, data = read_memories(directory)
    expected = {"program.bin": program, "data.bin": data,
                "readback/program.bin": program, "readback/data.bin": data,
                "restore-application.bin": program[APP_START:],
                "bootloader-reference.bin": program[:APP_START], **calibration_files(data)}
    if set(manifest["files"]) != set(expected):
        raise ValueError("Manifest missing required files or contains unexpected paths")
    for name, content in expected.items():
        record = manifest["files"][name]
        if (record != {"bytes": len(content), "sha256": digest(content)}
                or (directory / name).read_bytes() != content):
            raise ValueError("Backup checksum/content mismatch: " + name)
    return program, data


def dependency_hint(error):
    module = getattr(error, "name", None) or str(error)
    return ("Missing Python dependency: " + str(module) + ". Install this repository's dependencies, then repeat the command:\n"
            + '  & "' + sys.executable + '" -m pip install -r "' + str(ROOT / "requirements.txt") + '"')


def require_serial_dependency():
    # Importing the driver opens no serial port. Check before launching a RAM
    # reader child process so a missing pyserial produces an actionable error.
    driver = importlib.import_module("serial")
    if not hasattr(driver, "Serial"):
        raise ValueError("The Python 'serial' module is not pyserial. Reinstall the pinned requirements.txt dependency.")


def tools():
    manifest = json.loads((ROOT / "tools/vendor-radiofoundry.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != "dm32-vendored-tools/1" or manifest.get("commit") != PIN:
        raise ValueError("Vendored recovery tools have the wrong pin or manifest")
    expected = manifest.get("files", {})
    actual = {p.relative_to(UPSTREAM).as_posix() for p in UPSTREAM.rglob("*")
              if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"}
    if not expected or actual != set(expected):
        raise ValueError("Vendored recovery tools have missing or unexpected files")
    for name, record in expected.items():
        path = (UPSTREAM / name).resolve()
        if not path.is_relative_to(UPSTREAM.resolve()):
            raise ValueError("Invalid vendored-tool path")
        content = path.read_bytes()
        if record != {"bytes": len(content), "sha256": digest(content)}:
            raise ValueError("Vendored recovery tool checksum mismatch: " + name)
    return UPSTREAM / "stub/stubtool.py", UPSTREAM / "tools/serial_loader.py"


def run(arguments, log):
    # Preserve complete tool output, including interrupted or failed reads.
    with log.open("x", encoding="utf-8") as output:
        process = subprocess.Popen([str(x) for x in arguments], stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, bufsize=1)
        try:
            for line in process.stdout:
                print(line, end="", flush=True)
                output.write(line)
                output.flush()
            if process.wait() != 0:
                raise RuntimeError("Recovery tool failed; see " + str(log))
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait()


def dump(stub, port, directory, attach=False):
    directory.mkdir(parents=True, exist_ok=False)
    command = [sys.executable, "-u", stub, port, "--board", "dm32", "--baud", "off",
               "--progmem", directory / "program.bin", "--q128", directory / "data.bin"]
    if attach:
        command.append("--attach")
    run(command, directory / "read.log")
    return read_memories(directory, require_application=False)


def compare(current, original, full=False):
    program, data = current
    old_program, old_data = original
    if full:
        if current != original:
            raise ValueError("Full memory comparison differs from backup")
    elif (program[:APP_START] != old_program[:APP_START]
          or calibration_files(data) != calibration_files(old_data)):
        raise ValueError("Bootloader or calibration pages differ; refuse update")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("backup", "inspect", "verify-radio", "flash", "restore"))
    parser.add_argument("--directory", type=Path, required=True, help="New backup folder, or existing sealed backup")
    parser.add_argument("--radio-label", required=True, help="Owner's unique label/serial for this physical radio")
    parser.add_argument("--firmware", help="Installed version; required for backup")
    parser.add_argument("--port", help="Explicit cable COM port")
    parser.add_argument("--image", type=Path, help="Diagnostic application/updater file for flash")
    parser.add_argument("--image-sha256", help="Expected diagnostic file SHA-256")
    parser.add_argument("--execute", action="store_true", help="Allow the selected hardware operation")
    args = parser.parse_args()
    directory = args.directory.resolve()
    if not args.radio_label.strip():
        parser.error("radio label must not be empty")
    if args.action == "backup":
        if not args.firmware or not args.firmware.strip():
            parser.error("backup requires --firmware")
        if directory.exists():
            parser.error("backup directory already exists; choose a new folder (never overwrite)")
        if not args.execute:
            print("PLAN ONLY: two complete reads of 1 MB program + 16 MB data; seal on byte equality.")
            return
    else:
        original = validate(directory, args.radio_label)
        print("Backup valid locally. Hashes detect corruption; they do not authenticate hardware identity.")
        if args.action == "inspect":
            return
    stub, loader = tools()
    image = None
    if args.action in ("flash", "restore"):
        if args.action == "flash":
            if not args.image or not args.image_sha256:
                parser.error("flash requires --image and --image-sha256")
            image = args.image.resolve()
            if digest(image.read_bytes()) != args.image_sha256.lower():
                raise ValueError("Application image SHA-256 mismatch")
        else:
            image = directory / "restore-application.bin"
        sys.path.insert(0, str(UPSTREAM / "tools"))
        library = runpy.run_path(str(loader))
        raw, _ = library["unwrap"](image.read_bytes(), library["MODELS"]["dm32"])
        library["check_image"](raw, library["MODELS"]["dm32"])
        print("Application only: 0x0300C000 onward; no bootloader or data-flash restore.")
    if not args.execute:
        print("PLAN ONLY: no serial port opened. --execute enables the selected operation.")
        return
    if not args.port:
        parser.error("hardware access requires an explicit --port")
    require_serial_dependency()
    print("Use the labeled radio. Turn it OFF; leave it off until the RAM tool asks you to power on.")
    if args.action == "backup":
        dump(stub, args.port, directory)
        dump(stub, args.port, directory / "readback", attach=True)
        seal(directory, args.radio_label, args.firmware)
        validate(directory, args.radio_label)
        print("SEALED: two matching full reads; application and calibration copies saved.")
    else:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        current = dump(stub, args.port, directory / ("check-" + stamp))
        compare(current, original, full=args.action == "verify-radio")
        print("Radio memory comparison passed.")
        if image:
            # Snapshot the exact validated file for the prompted updater invocation.
            # It cannot accidentally erase using a later rebuild at the input path.
            staged = directory / ("update-" + stamp + ".bin")
            with staged.open("xb") as output:
                output.write(raw)
            print("Now power-cycle into FACTORY update mode: hold PTT + SK1 at power-on (green LED).")
            print("Follow the updater prompt. After restore, run verify-radio BEFORE normal boot if possible.")
            subprocess.run([sys.executable, str(loader), "--model", "dm32", str(staged),
                            "--port", args.port], check=True)
            print("Transfer completed; this is not independent flash readback verification.")
    print("RAM monitor may remain active: power-cycle normally when ready. Keep all backup files private.")


if __name__ == "__main__":
    try:
        main()
    except ModuleNotFoundError as error:
        print("radio-safety: " + dependency_hint(error), file=sys.stderr)
        sys.exit(1)
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print("radio-safety: " + str(error), file=sys.stderr)
        sys.exit(1)
