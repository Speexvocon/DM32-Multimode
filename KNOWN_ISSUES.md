# Known issues and scope

This is an early private beta for the DM32 target used during development. Physical evidence comes from one development unit and finite local tests. Compatibility with other variants, hardware revisions and stock update baselines must be checked before installation; a similar model name alone is insufficient.

## Current issues

- **DMR initial acquisition:** the latest clean uplink had a first-sync/receiver-sequence anomaly, followed by correct synchronization. The trace does not prove a duplicated or missing transmitted burst. A preamble change has not been qualified.
- **Uniden DMR uplink compatibility:** the AnyTone decoded clear DM32 speech. The Uniden previously missed an entire uplink, and its settings after the preceding P25 test were not confirmed. The latest pacing pass did not retest it.
- **Accessory audio routing:** the tested radio-side programming plug affects microphone/speaker routing. Disconnect it for an audible or live-microphone comparison; reconnect without powering off when diagnostics are needed.
- **DMR transmit display:** the transmit view remains static during the active call and ending to keep LCD transfers from delaying voice-queue service. It redraws after completion.
- **Programming labels/format:** use this repository's CPS and custom JSON codeplugs. Stock CPS, RadioFoundry binary codeplugs and CHIRP are not supported programming routes for this beta.

## Implemented but not physically qualified

The following remain available development features rather than proven compatibility claims:

- Analog FM RF/audio, deviation, tone/squelch behavior and transmit/receive routing.
- DMR repeater access and private-call interoperability; P25/DMR split-frequency operation.
- Mixed-mode memory scanning and acquisition during its short dwell.
- Browser CPS end-to-end physical read/write/readback. The protocol and editor have host/parser tests; earlier logical hardware transfers do not qualify the browser UI session.
- Reception/transmission across the radio's advertised bands, calibrated signal strength/deviation and weak-signal performance.
- Extended soak, large repeated-turnaround batches and worst-case runtime resource margins. These were deliberately deferred for the private beta.
- A full physical stock restore followed by beta reinstall as a release recovery exercise. Preserve your own original backup before changing firmware.

## Product limits

- One RF receiver; A/B are selectable contexts, not simultaneous dual receive.
- Conventional clear P25 Phase 1 and conventional DMR only. No trunking, P25 Phase 2, APRS or decryption.
- PROM does not override encrypted/unsupported mute. DMR PROM remains on the configured timeslot.
- 32 memories, 12 printable ASCII characters per name and four overlapping scan lists. No named zones, contact/alias database or multi-talkgroup allowlists.
- No priority scan, nuisance delete, VOX or DTMF feature in this iteration.
- Low-power operation and a 30-second call limit. The keypad lock leaves PTT operational.
- Signal bars are approximate RF strength; battery fill is approximate pack level. Neither is a calibrated instrument or runtime estimate.

See [TESTING.md](TESTING.md) to report a reproducible result. Do not assume a passing retry makes a prior missed or partial call irrelevant; include both observations.
