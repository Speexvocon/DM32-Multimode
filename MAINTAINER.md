# Maintaining beta packages

The repository is published privately; the owner adds collaborators. Preserve previous release directories/qualification scope. Current: **v0.2.0-beta.1 / 2e0f18a**.

Checked-in applications exclude the proprietary codec. Never commit/attach generated `build/` packages, owner backups, contacts or calibration. Testers prepare their own complete updates via [FLASHING.md](FLASHING.md).

## Adding a release

1. Select an exact source revision and passing host/processor/package evidence.
2. Add `firmware/<version>/` with codec-free application, README and `release.json`: bytes/hash, build/source IDs, pins and qualification limits. Keep older versions.
3. Include matching project/dependency source/notices; update [SOURCE.md](SOURCE.md), its manifest and root checksums.
4. Review exact codec hashes/maps. Upstream recognition alone is insufficient. Separate offline equivalence/layout checks from physical qualification; preserve older releases' narrower gates.
5. Update default preparation release, notes, issues, quick start and CPS. Private output is versioned; never overwrite older packages. Leave installed hardware unchanged unless flashing is requested.
6. Check source/distribution consistency and privacy, then run validation and commit/push the authorized changes. A GitHub tag/prerelease is separate; documentation must not claim one unless it exists.

## Local checks

```powershell
python -m pip install -r requirements.txt
python tools/check-release.py
python -m unittest discover -s tests -p "test_beta_tools*.py" -v
node --test cps/tests/*.test.js
```

These checks open no serial port. They cover integrity, codec/installer refusal paths and CPS host behavior, not new hardware qualification. Record physical results separately without committing private captures.

Review fresh installation and **existing sealed backup** paths. Returning testers must not need another original backup, stock upgrade, manual codec choice or compiler. Every real update still needs a fresh preservation read and independent postflash readback. Check `--help`, offline plan, exact errors and safe repeat preparation.

Hosted CPS: [DM32 Studio](https://speexvocon.github.io/DM32-Studio/). Match the bundled copy to its declared revision and verify published hashes. It supports legacy geometry without silently truncating V4. Rebuilding needs the pinned C-SKY toolchain/dependencies in [SOURCE.md](SOURCE.md); beta CI does not rebuild firmware or merge a codec.
