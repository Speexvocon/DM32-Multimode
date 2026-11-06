# Beta feedback

Use the radio normally within the [known scope](KNOWN_ISSUES.md). Repeated qualification is not required. One clear reproduction with a useful comparison is more valuable than many undocumented attempts.

## Useful first observations

1. Confirm startup/build and your own saved channel/ID values. After a harmless edit, wait for SAVED and check retention on restart.
2. Compare a known receive source with another receiver if available. Note mode, RX identity, screen wake and audio quality.
3. Check one short TX call and automatic RX return. For DMR record CC, slot, destination and direct/repeater.
4. Try Frequency/Channel, encoder in the active zone, A/B, lock and lights. Keypad lock leaves PTT operational.
5. For CPS, export initial JSON, review an edit, read back and check retention. V4's 256 channels/zones/lists are new hardware feedback areas.
6. For scan, report Channel or P25 TG type, members/base, timing and reply policy. Note accepted/excluded TG behavior.

These are optional areas, not an exhaustive test checklist. Do not transmit merely to exercise a feature without an appropriate local setup.

## A useful issue report

Open a [bug report](https://github.com/Speexvocon/DM32-Multimode/issues/new?template=bug_report.yml) with:

- Package/build ID from **Tools → Diagnostics → Radio status** (P2 by default), hardware/stock baseline and detected codec profile if known.
- Mode, simplex/split, direct/repeater, frequencies and NAC or CC/slot/destination. Redact personal IDs if preferred.
- Expected behavior, actual behavior and the smallest repeatable sequence.
- Reference-receiver result and any SYNC/details, cutouts, shortened call, fault, flicker or restart.
- Whether the programming cable was connected, or volume/settings changed during the call.
- For installation: command/step and exact error. Lines above the final hint often contain the useful codec/backup detail.

Photograph a fault or copy its text before restart when practical. Minimal status/fault counters help when requested; diagnostics remain secondary to ordinary controls.

## Files and privacy

Never attach stock backups, calibration or locally merged codec images. CPS JSON may contain IDs, names and frequencies; inspect it before sharing. CSV omits zones/lists/globals and cannot replace JSON for reproduction/rollback. Send sensitive configuration privately if needed. Avoid sharing others' recordings without permission.

A hotspot BER/correction percentage needs source/context; it is not automatically calibrated full-air BER or deviation. Include failed attempts alongside passing retries.
