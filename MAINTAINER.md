# Maintaining beta packages

The initial package is prepared for owner review. No initial commit, tag or
GitHub release was created during preparation. The owner will add collaborators.

## First publication

1. Review the files, flashing guide, known issues and native-codec restriction.
2. Obtain the owner's requested approval **before making the initial commit**.
3. Commit and push the approved contents to the private repository.
4. Let the validation workflow pass. Tag/publish a prerelease only when the
   owner chooses to distribute that beta; creating the repository is separate.

The checked-in application deliberately has no proprietary native codec. Never
attach an owner's generated `build/` package, backup, contacts or calibration to
a repository, issue or release. A collaborator prepares their own complete image
locally following [FLASHING.md](FLASHING.md).

## Adding another firmware

1. Select the exact source revision and successful target/host build evidence.
2. Add a new `firmware/<version>/` directory; retain the previous version.
3. Include the codec-free application and a `release.json` with its exact bytes,
   SHA-256, source revision, upstream pins and qualification limits.
4. Add the matching project source archive, any changed dependency source and
   notices. Update [SOURCE.md](SOURCE.md) and its source manifest/checksums.
5. Review native-codec compatibility before changing the qualified hashes in
   the local package builder. A codec recognized upstream is not automatically
   qualified with this application's native host.
6. Update release notes, known issues and the default release selected by the
   preparation tool. Preserve earlier manifests and evidence of their scope.
7. Update root `SHA256SUMS` for all applications, release manifests and source
   archives. Run the checks below before publication.

## Local checks

```powershell
python -m pip install -r requirements.txt
python tools/check-release.py
python -m unittest discover -s tests -p "test_beta_tools*.py" -v
node --test cps/tests/model.test.js cps/tests/transport.test.js
```

These checks do not open a serial port. They validate distribution integrity,
host protocol behavior and refusal paths; they do not qualify a new firmware on
hardware. Record hardware results separately without committing private captures.

Rebuilding source uses a C-SKY toolchain and pinned dependencies, as explained
in [SOURCE.md](SOURCE.md). The beta repository's validation workflow does not
rebuild firmware or merge a codec.
