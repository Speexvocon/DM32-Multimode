"""Offline beta packaging and verification. No serial ports are opened here."""
import hashlib
import json
from pathlib import Path
import re
import runpy
import sys
import struct

import radio_safety as safety

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RELEASE = ROOT / "firmware/v0.2.0-beta.1/release.json"
QUALIFIED_CODE = "cd0820a18df0b53bf011907a02d5b649bfbccf030c3d0432f4e363077d67a2c0"
QUALIFIED_TABLES = "10684c33e3cc8238376e455fd96b1c15a863a864420dbbaa4589803c4eb0b0e1"
SLOT_OFFSET = 0xE8000 - safety.APP_START
RAW_NAME = "application-codec.bin"
VENDOR_NAME = "application-codec_BFUV32.bin"


# Exact known native byte/layout contracts. These permit offline packaging;
# they do not assert fresh on-radio or RF qualification for a release.
def _native_contract(identifier, name, code_sha256, tables_sha256=QUALIFIED_TABLES,
                     code_bytes=0x14600, run=0x16CDC, tables_ram=0x18000EA8,
                     fec_init=0x1BF8, relocations=(0x1AD4, 0x1AD8, 0x2E8C), slot_bytes=95748):
    return {"id": identifier, "name": name, "code_sha256": code_sha256,
            "tables_sha256": tables_sha256, "code_bytes": code_bytes, "tables_bytes": 0x2F78,
            "run": run, "tables_ram": tables_ram, "stock_tag": 46 if "046" in identifier else 49,
            "entries": dict(zip(("decode", "encode", "dec_init", "dec_set", "enc_init", "enc_set", "fec_init"),
                                (0, 0x260, 0xB4, 0x84, 0x314, 0x2E4, fec_init))),
            "relocations": list(relocations), "slot_bytes": slot_bytes}


SUPPORTED_NATIVE_CODECS = {item["id"]: item for item in (
    _native_contract("dm32-046", "Standard 046 (01.01 / 01.02)",
        "9720ec0c923ac32bc909d06a0d4c414c6a1e80c3eaa6e9c5b5df0d0bf5ff5665"),
    _native_contract("dm32-049", "Standard 049",
        "355ca9061979eceb2991826da9d39c95b4a9d40466245923d541a6556ceeafd1"),
    _native_contract("dm32-nrf-049", "NRF / fanti 049", QUALIFIED_CODE, tables_ram=0x18000EB0),
    _native_contract("dm32-046hr", "HR Vocoder 046",
        "02743cf4b3d252b8764fe083fb808b00ab42f0f0ab76935e62ca59fd5c5e64fb",
        tables_sha256="cd5a4d270f555cdbd586bca8de89e4e845789ed7aa2a2bb7414b6c3a270ef803",
        code_bytes=0x140DC, run=0x1B838, tables_ram=0x18000E48, fec_init=0x1DCC,
        relocations=(0x1CA8, 0x1CAC, 0x3060), slot_bytes=94432),
)}


def native_contract_records():
    """JSON-safe release metadata, independent of mutable caller objects."""
    return json.loads(json.dumps(list(SUPPORTED_NATIVE_CODECS.values())))


def release_supported_codecs(manifest):
    """Do not silently broaden the historical release's single-codec claim."""
    declared = manifest.get("supported_native_codecs")
    if declared is not None:
        if not isinstance(declared, list) or not declared:
            raise ValueError("Release supported_native_codecs must list exact native contracts")
        identifiers = []
        for row in declared:
            identifier = row.get("id") if isinstance(row, dict) else None
            if identifier not in SUPPORTED_NATIVE_CODECS or row != SUPPORTED_NATIVE_CODECS[identifier]:
                raise ValueError("Release native-codec contract differs from the checked tool: " + str(identifier))
            identifiers.append(identifier)
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("Release repeats a native-codec contract")
        return set(identifiers)
    old = manifest.get("qualified_native_codec", {})
    identifiers = {identifier for identifier, row in SUPPORTED_NATIVE_CODECS.items()
                   if (old.get("code_sha256"), old.get("tables_sha256")) ==
                      (row["code_sha256"], row["tables_sha256"])}
    if not identifiers:
        raise ValueError("Release does not declare a supported native codec")
    return identifiers


def _version_directory(label, version):
    if not isinstance(version, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", version):
        raise ValueError("Release version is not a safe package directory name")
    return label_directory(label) / version


def default_package_path(label, release=None):
    manifest = read_json(DEFAULT_RELEASE if release is None else release)
    return _version_directory(label, manifest.get("version")) / "package.json"


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
    release_supported_codecs(manifest)
    _version_directory("release-validation", manifest["version"])
    app = manifest.get("application", {})
    application = file_in(path.parent, app.get("file")).read_bytes()
    if {k: app.get(k) for k in ("bytes", "sha256")} != record(application):
        raise ValueError("Release application size or SHA-256 mismatch")
    if len(application) > SLOT_OFFSET:
        raise ValueError("Release application overlaps the native codec slot")
    loader["check_image"](application, loader["MODELS"]["dm32"])
    return path, manifest, application


class NativeCodecError(ValueError):
    """A useful, non-sensitive fingerprint can accompany a refused profile."""
    def __init__(self, message, info=None):
        super().__init__(message)
        self.info = info


def _extract_native(program, codec):
    try:
        profile, code, tables = codec["extract"](program, board="dm32")
    except (ValueError, codec.get("ExtractError", ValueError)) as error:
        raise NativeCodecError("Native codec not recognized in this sealed backup. Keep it private and send the "
                               "stock version and this diagnostic to the maintainer. No radio was accessed. " + str(error)) from error
    info = {"profile": profile.get("name", "unknown"), "code_sha256": safety.digest(code),
            "tables_sha256": safety.digest(tables), "code_bytes": len(code), "tables_bytes": len(tables)}
    contract = next((row for row in SUPPORTED_NATIVE_CODECS.values()
                     if row["code_sha256"] == info["code_sha256"]), None)
    fingerprint = (f"{info['profile']} (code {info['code_sha256']}, tables {info['tables_sha256']})")
    if contract is None:
        raise NativeCodecError("Unsupported native codec: " + fingerprint +
                               ". Keep the backup private; send this fingerprint and stock version to the maintainer. "
                               "Do not force a profile or substitute another radio's backup.", info)
    info["contract"] = contract["id"]
    if info["tables_sha256"] != contract["tables_sha256"]:
        raise NativeCodecError("Native codec table hash mismatch for " + fingerprint + "; preparation refused.", info)
    if (profile.get("board") != "dm32" or profile.get("tag") != contract["stock_tag"]
            or len(code) != contract["code_bytes"] or len(tables) != contract["tables_bytes"]
            or tuple(profile.get("code", ()))[1:] != (contract["code_bytes"], contract["run"])
            or tuple(profile.get("tables", ()))[1:] != (contract["tables_bytes"], contract["tables_ram"])
            or profile.get("entries") != contract["entries"]):
        raise NativeCodecError("Native codec layout/entry placement mismatch for " + fingerprint + "; preparation refused.", info)
    codec_map = codec["codec_map"](code)
    if (not codec_map or codec_map.get("profile") != contract["id"]
            or codec_map["code"]["len"] != contract["code_bytes"]
            or codec_map["code"]["run"] != contract["run"]
            or codec["codecmap"].relocations(codec_map) != contract["relocations"]):
        raise NativeCodecError("Native codec relocation map differs for " + fingerprint + "; preparation refused.", info)
    if struct.unpack_from("<2I", code) != (0x152514D8, 0x74C776CD):
        raise NativeCodecError("Native codec signature differs for " + fingerprint + "; preparation refused.", info)
    info.update(run=contract["run"], tables_ram=contract["tables_ram"],
                entries=dict(contract["entries"]), relocations=list(contract["relocations"]))
    return profile, code, tables, contract, info


def codec_info(backup, label, release=None):
    """Validate an existing sealed backup and identify native bytes, entirely offline."""
    program, _ = safety.validate(Path(backup).resolve(), label)
    codec, _ = libraries()
    _, _, _, contract, info = _extract_native(program, codec)
    release_path = DEFAULT_RELEASE if release is None else Path(release)
    manifest = read_json(release_path)
    info.update(supported_by_tools=True,
                allowed_by_release=contract["id"] in release_supported_codecs(manifest),
                release_version=manifest["version"], hardware_accessed=False,
                validation="Offline hashes, layout, entries and relocation map; no codec execution or RF test.")
    return info


def merge_qualified(application, program, codec, loader, allowed_profiles=None, release_version=None):
    profile, code, tables, contract, _ = _extract_native(program, codec)
    if allowed_profiles is not None and contract["id"] not in allowed_profiles:
        raise NativeCodecError(f"Native profile {contract['name']} is supported by these tools but is not declared "
                               f"for release {release_version or 'selected'}. Select a release that declares this profile; "
                               "do not force the old release or replace the backup.")
    merged = codec["merge"](application, profile, code, tables)
    slot = merged[SLOT_OFFSET:]
    parsed = codec["parse_slot"](slot)
    if (not parsed or len(slot) != contract["slot_bytes"] or parsed.get("version") != 2
            or parsed.get("length") != contract["slot_bytes"]
            or parsed.get("code_sha256") != contract["code_sha256"]
            or parsed.get("tables_sha256") != contract["tables_sha256"]
            or parsed.get("run") != contract["run"] or parsed.get("tables_ram") != contract["tables_ram"]
            or parsed.get("tag") != contract["stock_tag"] or parsed.get("relocations") != contract["relocations"]):
        raise ValueError("Merged native codec slot failed its profile layout, CRC or hash checks: " + contract["name"])
    header = struct.unpack_from("<19I", slot)
    code_off = 128
    tables_off = code_off + ((len(code) + 3) & ~3)
    relocations_off = tables_off + ((len(tables) + 3) & ~3)
    if (header[:8] != (0x43524444, 2, code_off, len(code), contract["run"], tables_off, len(tables), contract["tables_ram"])
            or list(header[8:15]) != [contract["entries"][key] for key in codec["ENTRIES"]]
            or header[17:] != (relocations_off, len(contract["relocations"]))
            or slot[code_off:code_off+len(code)] != code or slot[tables_off:tables_off+len(tables)] != tables):
        raise ValueError("Merged native codec bytes or entry/header contract changed: " + contract["name"])
    if (merged[:len(application)] != application or len(merged) > safety.PROGRAM_SIZE - safety.APP_START
            or merged[len(application):SLOT_OFFSET] != b"\xff" * (SLOT_OFFSET-len(application))):
        raise ValueError("Merged image changed the application/padding or exceeded program flash")
    model = loader["MODELS"]["dm32"]
    checks = loader["check_image"](merged, model)
    wrapped = loader["wrap"](merged, model)
    if loader["unwrap"](wrapped, model) != (merged, "vendor"):
        raise ValueError("Vendor updater wrapping failed its round trip")
    return merged, wrapped, parsed, checks


def prepare(backup, label, release=None, output=None):
    program, data = safety.validate(Path(backup).resolve(), label)
    codec, loader = libraries()
    release_path, manifest, application = release_application(DEFAULT_RELEASE if release is None else release, loader)
    merged, wrapped, parsed, checks = merge_qualified(application, program, codec, loader,
        release_supported_codecs(manifest), manifest["version"])
    destination = Path(output).resolve() if output else _version_directory(label, manifest["version"]).resolve()
    if not destination.is_relative_to((ROOT / "build").resolve()) or destination == (ROOT / "build").resolve():
        raise ValueError("Private generated packages must be inside build/<folder>/")
    if destination.exists():
        package_path = destination / "package.json"
        try:
            existing, old_image, _ = validated_package(package_path, backup, label)
            if (existing["release_manifest_sha256"] != safety.digest(release_path.read_bytes())
                    or existing["release_manifest"] != release_path.relative_to(ROOT).as_posix()
                    or old_image != merged):
                raise ValueError("Existing package belongs to another release")
        except (ValueError, KeyError, TypeError, OSError) as error:
            raise ValueError("Output directory exists and cannot be safely reused (never overwrite): " + str(destination)
                             + ". Choose a new --output under build/. " + str(error)) from error
        return package_path
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
    if not path.is_file():
        raise ValueError("No prepared package at " + str(path) + ". Run tools/prepare-firmware.py with this backup and radio label first.")
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
    merged, wrapped, parsed, _ = merge_qualified(app, program, codec, loader,
        release_supported_codecs(release), release["version"])
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
