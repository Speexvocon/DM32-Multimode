# Beta feedback

Use the radio normally within the [known scope](KNOWN_ISSUES.md). Repeated qualification is not required to participate. One clear reproduction with a useful comparison is more valuable than many undocumented attempts.

## Suggested first checks

1. Confirm startup and your own channel/ID values. Change a harmless setting, wait for SAVED, restart and check retention.
2. Compare a known local receive source with another receiver, if available. Note mode, received identity, screen wake and audio quality.
3. Check a short transmit call with an independent receiver, then automatic return to reception. For DMR, record color code, slot, destination and direct/repeater selection.
4. Try VFO/memory selection, A/B, keypad lock/unlock and light timeouts. Confirm PTT remains usable while locked.
5. If using CPS, save the initial download, review an edit before writing, read it back and confirm retention after restart.

These are optional feedback areas. FM RF/audio, repeater/split operation and mixed-mode scan remain unqualified; report them as new observations rather than established features.

## A useful issue report

Open a [bug report](https://github.com/Speexvocon/DM32-Multimode/issues/new?template=bug_report.yml) with:

- Firmware version/build ID from P2 → Radio status, radio model and any known hardware/stock baseline.
- Mode, simplex or split, direct or repeater, frequencies and the relevant NAC or color code/timeslot/destination. Redact personal IDs if preferred.
- What you expected, what happened, and the smallest sequence that repeats it.
- Whether a reference receiver heard smooth/full audio, and whether the DM32 showed SYNC, received details, a warning, flicker or restart.
- Whether the programming cable was connected during the symptom, and whether volume or settings changed during the call.

If there is a fault, photograph the visible message or record its exact text before restarting when practical. Optional serial counters are helpful when requested; diagnostics are secondary to the normal radio controls.

## Files and privacy

Do not attach a complete stock backup, calibration dump or locally merged native-codec image. A CPS JSON file can contain your radio ID, channel names and frequencies; inspect it before sharing. Send sensitive configuration privately to the maintainer if needed. Avoid posting recordings of other users without permission.

A reported hotspot “BER” or correction percentage is useful only with its source and context. It is not automatically a calibrated full-air BER or deviation measurement. Keep missing calls, partial audio and failed attempts in the report instead of reporting only a successful retry.
