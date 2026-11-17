# Maintaining beta packages

This repository is publicly readable. Current staged release:
**v0.3.0-beta.1 / firmware6868053**. Keep earlier release directories/archives
unchanged and distinguish firmware source from later CPS-only revisions.

Distribute only codec-free applications. Never commit backups, calibration,
contacts/personal JSON, human voice captures, extracted native codecs or merged
owner images. Source export uses reviewed tracked blobs with explicitly recorded
test/example privacy edits; production sources/build inputs remain exact.

For each release record exact target/host CI, application hash/size, linked RAM,
source archive and qualification limits. Refresh matching tools/docs/CPS and
applet hashes. Keep new output private until checks and review pass.

```powershell
python tools/check-release.py
python -m unittest discover -s tests -p "test_beta_tools*.py" -v
node --test cps/tests/*.test.js
```

These checks open no hardware. Source/dependency/codec checks are separate from
physical RF/browser qualification. Reuse existing sealed backups for local
preparation. The retained guarded CLI flash helper explicitly performs a
preservation-reader workflow; routine browser update and owner runtime update
flows are documented separately. A repository push is not a GitHub release;
do not claim a tag/prerelease unless it exists.
