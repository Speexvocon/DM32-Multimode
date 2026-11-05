"""Offline beta packaging and verification. No serial ports are opened here."""
import hashlib
import json
from pathlib import Path
import re
import runpy
import sys

import radio_safety as safety

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RELEASE = ROOT / "firmware/v0.1.0-beta.1/release.json"
QUALIFIED_CODE = "cd0820a18df0b53bf011907a02d5b649bfbccf030c3d0432f4e363077d67a2c0"
QUALIFIED_TABLES = "10684c33e3cc8238376e455fd96b1c15a863a864420dbbaa4589803c4eb0b0e1"
SLOT_OFFSET = 0xE8000 - safety.APP_START
RAW_NAME = "application-codec.bin"
VENDOR_NAME = "application-codec_BFUV32.bin"


def record(content):
    return {"bytes": len(content), "sha256": safety.digest(content)}


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def file_in(directory, name):
    if not isinstance(name, str) or not name or Path(name).name != name or name in (".", ".."):
        raise ValueError("Expected a plain filename, not a path")
    path = (directory / name).resolve()
    if not path.is_relative_to(directory.resolve()):
        raise ValueError("File escapes its directory")
    return path


def label_directory(label):
    if not label.strip():
        raise ValueError("Radio label must not be empty")
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", label).strip("._-")
    if not name or name.upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
                                    *(f"LPT{i}" for i in range(1, 10))}:
        raise ValueError("Choose a label containing a usable filename")
    return ROOT / "build" / name


def libraries():
    _, loader = safety.tools()  # Check every vendored byte before importing it.
    sys.path.insert(0, str(safety.UPSTREAM / "tools"))
    return (runpy.run_path(str(safety.UPSTREAM / "tools/hrc7000_codec.py")),
            runpy.run_path(str(loader)))


def release_application(path, loader):
    path = Path(path).resolve()
    if not path.is_relative_to((ROOT / "firmware").resolve()):
        raise ValueError("Release manifest must be inside this repository's firmware/ directory")
    manifest = read_json(path)
    if (manifest.get("schema") != "dm32-multimode-release/1" or manifest.get("board") != "dm32"
            or not re.fullmatch(r"[0-9a-f]{40}", manifest.get("source_commit", ""))
            or not isinstance(manifest.get("version"), str)):
        raise ValueError("Unsupported release manifest or board")
    app = manifest.get("application", {})
    application = file_in(path.parent, app.get("file")).read_bytes()
    if {k: app.get(k) for k in ("bytes", "sha256")} != record(application):
        raise ValueError("Release application size or SHA-256 mismatch")
    if len(application) > SLOT_OFFSET:
        raise ValueError("Release application overlaps the native codec slot")
    loader["check_image"](application, loader["MODELS"]["dm32"])
    return path, manifest, application


def merge_qualified(application, program, codec, loader):
    profile, code, tables = codec["extract"](program, board="dm32")
    if (safety.digest(code), safety.digest(tables)) != (QUALIFIED_CODE, QUALIFIED_TABLES):
        raise ValueError("This native codec variant is not qualified for this beta; do not force or substitute another radio's codec")
    if profile["code"][2] != 0x16CDC or profile["tables"][2] != 0x18000EB0:
        raise ValueError("Native codec placement does not match the qualified beta")
    merged = codec["merge"](application, profile, code, tables)
    parsed = codec["parse_slot"](merged[SLOT_OFFSET:])
    if (not parsed or parsed.get("version") != 2 or parsed.get("length") != 95748
            or parsed.get("code_sha256") != QUALIFIED_CODE or parsed.get("tables_sha256") != QUALIFIED_TABLES
            or parsed.get("run") != 0x16CDC or parsed.get("tables_ram") != 0x18000EB0
            or parsed.get("relocations") != [0x1AD4, 0x1AD8, 0x2E8C]):
        raise ValueError("Merged native codec slot failed its layout, CRC or hash checks")
    if merged[:len(application)] != application or len(merged) > safety.PROGRAM_SIZE - safety.APP_START:
        raise ValueError("Merged image changed the application or exceeded program flash")
    model = loader["MODELS"]["dm32"]
    checks = loader["check_image"](merged, model)
    wrapped = loader["wrap"](merged, model)
    if loader["unwrap"](wrapped, model) != (merged, "vendor"):
        raise ValueError("Vendor updater wrapping failed its round trip")
    return merged, wrapped, parsed, checks


def prepare(backup, label, release=DEFAULT_RELEASE, output=None):
    program, data = safety.validate(Path(backup).resolve(), label)
    codec, loader = libraries()
    release_path, manifest, application = release_application(release, loader)
    merged, wrapped, parsed, checks = merge_qualified(application, program, codec, loader)
    destination = Path(output).resolve() if output else label_directory(label).resolve()
    if not destination.is_relative_to((ROOT / "build").resolve()) or destination == (ROOT / "build").resolve():
        raise ValueError("Private generated packages must be inside build/<folder>/")
    if destination.exists():
        raise ValueError("Output directory exists; choose a new --output under build/ (never overwrite)")
    package = {"schema": "dm32-beta-package/1", "board": "dm32", "radio_label": label,
               "release_manifest": release_path.relative_to(ROOT).as_posix(),
               "release_manifest_sha256": safety.digest(release_path.read_bytes()),
               "version": manifest["version"], "source_commit": manifest["source_commit"],
               "backup_program_sha256": safety.digest(program), "backup_data_sha256": safety.digest(data),
               "upstream_commit": safety.PIN, "native_codec": parsed,
               "application": record(application),
               "files": {RAW_NAME: record(merged), VENDOR_NAME: record(wrapped)},
               "checks": checks, "hardware_accessed": False, "firmware_written": False}
    destination.mkdir(parents=True, exist_ok=False)
    (destination / RAW_NAME).write_bytes(merged)
    (destination / VENDOR_NAME).write_bytes(wrapped)
    (destination / "package.json").write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
    return destination / "package.json"


def validated_package(package_path, backup, label):
    program, data = safety.validate(Path(backup).resolve(), label)
    codec, loader = libraries()
    path = Path(package_path).resolve()
    if not path.is_relative_to((ROOT / "build").resolve()):
        raise ValueError("Generated package must stay inside build/")
    package = read_json(path)
    if (package.get("schema") != "dm32-beta-package/1" or package.get("board") != "dm32"
            or package.get("radio_label") != label or package.get("upstream_commit") != safety.PIN
            or package.get("backup_program_sha256") != safety.digest(program)
            or package.get("backup_data_sha256") != safety.digest(data)):
        raise ValueError("Package is not bound to this labeled, sealed backup")
    release_path = (ROOT / package.get("release_manifest", "")).resolve()
    release_path, release, app = release_application(release_path, loader)
    if (package.get("release_manifest_sha256") != safety.digest(release_path.read_bytes())
            or package.get("source_commit") != release["source_commit"]
            or package.get("version") != release["version"] or package.get("application") != record(app)):
        raise ValueError("Package release provenance differs")
    merged, wrapped, parsed, _ = merge_qualified(app, program, codec, loader)
    expected = {RAW_NAME: merged, VENDOR_NAME: wrapped}
    if set(package.get("files", {})) != set(expected) or package.get("native_codec") != parsed:
        raise ValueError("Package native layout or file list differs")
    for name, content in expected.items():
        if package["files"][name] != record(content) or file_in(path.parent, name).read_bytes() != content:
            raise ValueError("Prepared package checksum/content mismatch: " + name)
    return package, merged, (program, data)


def verify_installed(current, original, merged):
    """New beta application + original bootloader/calibration, not old application."""
    safety.compare(current, original)
    if current[0][safety.APP_START:safety.APP_START + len(merged)] != merged:
        raise ValueError("Installed application differs from the prepared package")
    return {"application_matches": True, "bootloader_matches_backup": True,
            "calibration_matches_backup": True, "application_sha256": safety.digest(merged),
            "scope": "Application prefix, bootloader and calibration; ordinary settings may change after normal boot."}
