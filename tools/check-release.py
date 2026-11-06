"""Validate the beta's distributable files without a radio or network access."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
from urllib.parse import unquote
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = {".git", ".venv", "build", "backups", "captures", "local", "private", "work"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(content):
    return hashlib.sha256(content).hexdigest()


def checksum_file(path):
    records = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
        require(match is not None, "Malformed checksum line in " + str(path))
        name = match[2]
        require(name not in records, "Duplicate checksum: " + name)
        target = (path.parent / name).resolve()
        require(target.is_relative_to(ROOT), "Checksum path escapes repository")
        require(target.is_file() and digest(target.read_bytes()) == match[1], "Checksum mismatch: " + name)
        records[name] = match[1]
    require(bool(records), "Empty checksum list: " + str(path))
    return records


def main():
    sys.path.insert(0, str(ROOT / "tools"))
    import beta_tools
    releases = sorted((ROOT / "firmware").glob("*/release.json"))
    require(bool(releases), "No release manifest")
    root_checksums = checksum_file(ROOT / "SHA256SUMS")
    source_manifest = json.loads((ROOT / "source/SOURCE_MANIFEST.json").read_text(encoding="utf-8"))
    require(source_manifest.get("schema") == "dm32-beta-source-bundle/1", "Unknown source manifest")
    source_records = {row["file"]: row for row in source_manifest["artifacts"]}
    versions = []
    for path in releases:
        release = json.loads(path.read_text(encoding="utf-8"))
        require(release.get("schema") == "dm32-multimode-release/1", "Unknown release schema")
        require(release.get("board") == "dm32", "Wrong release board")
        require(re.fullmatch(r"[0-9a-f]{40}", release.get("source_commit", "")), "Missing exact source commit")
        require(path.parent.name == "v" + release.get("version", ""), "Release directory/version mismatch")
        require(release.get("firmware_display_id") == release["source_commit"][:7], "Firmware display/source mismatch")
        supported_codecs = beta_tools.release_supported_codecs(release)
        if "supported_native_codecs" in release:
            require(release.get("codeplug_geometry") == {
                "version": 4, "channels": 256, "vfos": 2, "records": 387,
                "zones": 16, "scan_lists": 16, "p25_talkgroups_per_list": 64,
            }, "Expanded release codeplug geometry mismatch")
            cps = release.get("cps", {})
            require(cps.get("url") == "https://speexvocon.github.io/DM32-Studio/"
                    and cps.get("source_commit") == release["source_commit"],
                    "Hosted CPS does not match expanded firmware source")
        app = release["application"]
        require(isinstance(app.get("file"), str) and Path(app["file"]).name == app["file"], "Unsafe application path")
        application = path.parent / app["file"]
        content = application.read_bytes()
        require(len(content) == app["bytes"] and digest(content) == app["sha256"], "Application differs from manifest")
        require(0 < len(content) < 0xE8000 - 0xC000, "Application occupies native codec slot")
        require(app.get("contains_native_codec") is False and app.get("directly_flashable") is False,
                "Bare application must be identified as requiring local preparation")
        for item in (path, application):
            require(item.relative_to(ROOT).as_posix() in root_checksums, "Release file missing from SHA256SUMS")
        source = (path.parent / release["distribution"]["matching_source"]).resolve()
        require(source.is_relative_to(ROOT / "source") and source.is_file(), "Matching source archive missing")
        require(source_records[source.name]["revision"] == release["source_commit"], "Source archive revision differs from firmware")
        with zipfile.ZipFile(source) as archive:
            require("src/firmware/dm32_p25_live.c" in archive.namelist(), "Application source missing")
            require("src/firmware/radio_dmr.c" in archive.namelist(), "DMR controller source missing")
            require("scripts/build-dm32.sh" in archive.namelist(), "Build script missing")
            require("research/references/nostar/imbe_vocoder/imbe_vocoder.cc" in archive.namelist(), "IMBE source missing")
        versions.append({"version": release["version"], "build": release["source_commit"][:7],
                         "application_bytes": len(content), "supported_native_profiles": sorted(supported_codecs)})

    require(beta_tools.DEFAULT_RELEASE in releases, "Default firmware release is missing")
    require(len({row["version"] for row in versions}) == len(versions), "Duplicate firmware version")

    archives = sorted((ROOT / "source").glob("*.zip"))
    require(len(archives) >= 3, "Project and dependency source archives are required")
    source_checksums = checksum_file(ROOT / "source/SHA256SUMS")
    for archive_path in archives:
        require(archive_path.name in source_checksums, "Source archive missing from checksum list")
        require(archive_path.relative_to(ROOT).as_posix() in root_checksums, "Source archive missing from root checksum list")
        recorded = source_records[archive_path.name]
        require(recorded["bytes"] == archive_path.stat().st_size and recorded["sha256"] == digest(archive_path.read_bytes()),
                "Source provenance manifest differs from archive")
        with zipfile.ZipFile(archive_path) as archive:
            require(archive.testzip() is None, "Corrupt source archive")
            files = {row.filename: row for row in archive.infolist() if not row.is_dir()}
            require(set(files) == set(recorded["files"]) and len(files) == recorded["tracked_files"], "Source file inventory differs")
            for name, row in recorded["files"].items():
                content = archive.read(name)
                require(len(content) == row["bytes"] and digest(content) == row["sha256"], "Source file checksum differs: " + name)
                # Preserve original Git provenance. Only declared test/example
                # privacy edits can use a separately recorded distributed blob.
                expected_blob = row["git_blob"]
                if row.get("privacy_sanitized"):
                    require(archive_path.name.endswith("-project.zip"), "Dependency source cannot be privacy-edited")
                    require(name.startswith(("tests/", "integrations/web-cps/tests/"))
                            or name == "scripts/export-p25-fixed.py", "Privacy edit outside test/example scope: " + name)
                    expected_blob = row["distributed_git_blob"]
                    require(re.fullmatch(r"[0-9a-f]{40}", row["git_blob"]) is not None,
                            "Missing original privacy-edit provenance: " + name)
                lf = content.replace(b"\r\n", b"\n")
                candidates = {content, lf, lf.replace(b"\n", b"\r\n")}
                blobs = {hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() for data in candidates}
                require(expected_blob in blobs, "Source differs from its recorded Git blob: " + name)
            sanitized = sorted(name for name, row in recorded["files"].items() if row.get("privacy_sanitized"))
            if sanitized:
                privacy = recorded["privacy_sanitization"]
                require(sorted(privacy["files"]) == sanitized, "Privacy-change inventory differs")
                require(privacy.get("firmware_sources_unchanged") is True, "Privacy change altered firmware source")
            for member in archive.infolist():
                name = PurePosixPath(member.filename)
                require(not name.is_absolute() and ".." not in name.parts and "\\" not in member.filename,
                        "Unsafe source archive path")
                require(not (set(name.parts) & {".git", ".venv", "__pycache__", ".codex-attachments"}),
                        "Unexpected private/cache content in source archive")
                require(not name.parts or name.parts[0] not in {"backups", "captures", "build", "private"},
                        "Private development directory in source archive")
                if archive_path.name.endswith("-project.zip"):
                    require(not member.filename.startswith(("research/analysis/", "research/downloads/")),
                            "Development analysis/download included in project source")

    for name in ("README.md", "FLASHING.md", "RECOVERY.md", "QUICK_START.md", "KNOWN_ISSUES.md",
                 "RELEASE_NOTES.md", "TESTING.md", "SOURCE.md", "THIRD_PARTY.md", "docs/CPS.md",
                 "source/SOURCE_MANIFEST.json", "licenses/GPL-3.0.txt", "licenses/RadioFoundry-MIT.txt",
                 "licenses/FreeRTOS-MIT.txt"):
        require((ROOT / name).is_file(), "Missing beta file: " + name)

    for notice in source_manifest["licensed_notice_origins"]:
        name = notice["file"]
        require(Path(name).name == name, "Unsafe license notice path")
        content = (ROOT / "licenses" / name).read_bytes()
        require(len(content) == notice["bytes"] and digest(content) == notice["sha256"], "License notice checksum differs: " + name)
    visible = [path for path in ROOT.rglob("*") if path.is_file()
               and path.relative_to(ROOT).parts[0] not in PRIVATE
               and "__pycache__" not in path.relative_to(ROOT).parts]
    direct_binaries = [path.relative_to(ROOT).as_posix() for path in visible if path.suffix.lower() == ".bin"]
    allowed_binaries = [(p.parent / json.loads(p.read_text(encoding="utf-8"))["application"]["file"]).relative_to(ROOT).as_posix()
                        for p in releases]
    require(sorted(direct_binaries) == sorted(allowed_binaries), "Unexpected binary outside private build/ storage")
    for path in visible:
        if path.suffix.lower() != ".md":
            continue
        if path.is_relative_to(ROOT / "tools/vendor"):
            continue  # Vendored upstream excerpts retain their original links.
        text = path.read_text(encoding="utf-8")
        for raw in re.findall(r"\[[^\]\n]*\]\(([^)\n]+)\)", text):
            target = raw.strip().strip("<>").split("#", 1)[0]
            if not target or re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", target):
                continue
            local = (path.parent / unquote(target)).resolve()
            require(local.is_relative_to(ROOT) and local.exists(), "Broken local link in " + str(path.relative_to(ROOT)) + ": " + target)

    sys.path.insert(0, str(ROOT / "tools"))
    import radio_safety
    radio_safety.tools()
    print(json.dumps({"passed": True, "releases": versions, "source_archives": len(archives),
                      "distributable_files": len(visible), "direct_binary_files": direct_binaries,
                      "native_codec_distributed": False, "radio_accessed": False}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        print("release validation: " + str(error), file=sys.stderr)
        sys.exit(1)
