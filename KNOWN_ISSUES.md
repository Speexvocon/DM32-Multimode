# Known issues and scope

This is an early private beta. Physical evidence comes from one development radio and finite local tests. **V0.2.0-beta.2 / 32f973f** passed host/processor/package checks, installation/readback and one controlled P25 LISTENING-to-DMR tone transition without a restart. This used one development radio with the NRF/fanti 049 codec; P25 scan was not running. The test began with the retained existing four-channel configuration and included normal menu saves. It does not qualify full 256-channel/zone/list capacity or other hardware/codec variants.

## Current issues

- **P25-to-DMR audio correction:** beta.2 fixes a stopped P25 worker disabling DMR's shared PCM interrupt/output. The hardware pass covers one ordinary P25 LISTENING-to-DMR transition. Scan-to-DMR has host regression coverage only; broader transitions/endurance remain feedback areas.
- **DMR initial acquisition:** an earlier clean uplink showed a first-sync/receiver-sequence anomaly followed by correct synchronization. That trace does not prove a missing/duplicated transmitted burst; a preamble change is unqualified.
- **Uniden DMR uplink:** an AnyTone decoded clear DM32 speech. A Uniden missed an entire uplink; its settings after a P25 test were unconfirmed. Later pacing testing did not settle compatibility.
- **Accessory audio:** the programming plug affects mic/speaker routing. Remove the radio-side plug for audio comparisons; reconnect without powering off if counters are needed.
- **DMR TX display:** the view stays static through the call/ending to keep LCD transfers from delaying voice queues. It redraws afterward.
- **V4 rollback:** old firmware cannot read expanded memories/zones/lists. Export compatible JSON before upgrade; CSV is not a complete backup. See [FLASHING.md](FLASHING.md#upgrading-an-existing-beta).
- **Programming format:** use DM32 Studio/custom JSON. Stock CPS, RadioFoundry binary codeplugs and CHIRP are not interchangeable.

## Native-codec compatibility

The installer detects exact codec bytes from **your own sealed original backup**. The new release accepts:

| Profile | Evidence and limit |
| --- | --- |
| Standard 01.01.046 / 01.02.046 | Same codec in both; offline comparison with tested 049 implementation, plus slot/relocation/package checks |
| Standard 01.01.049 | Offline slot/relocation/package checks and comparison with the tested 049 family |
| 01.01.049 NRF / fanti | Family used in physical development tests; exact backup still validated |
| 046HRVocoder | Separate layout/init map; offline slot/relocation/package checks; voice/audio not physically qualified |

These are exact contracts, not every file labeled 046/049. Unknown/altered code or tables are refused before erase. The codec is preserved locally, never supplied here. Detection does not establish RF/audio interoperability on every hardware variant. V0.1.0 retains its original NRF/fanti-only gate.

## Features needing broader physical qualification

- New 256-channel geometry, 16-zone navigation, independent TG lists/reply policies and mixed-mode scan acquisition.
- Two-way FM RF/audio, deviation, tone/squelch and routing. Broadcast FM receive has development feedback; this does not qualify two-way FM.
- Actual output at selectable power levels, calibrated signal/deviation and weak-signal behavior across bands.
- DMR repeater/private-call interoperability and P25/DMR split operation.
- End-to-end physical browser programming on V4. C/parser, migration, interruption and simulated-browser tests are not hardware transfers.
- Extended soak/worst-case margins and a complete stock-restore/reinstall exercise on a second radio. These remain deferred beta areas, not mandatory participation tests.

## Product limits

- One receiver; A/B are selectable contexts, not simultaneous dual receive.
- Conventional clear P25 Phase 1 and DMR; no trunking, P25 Phase 2, APRS or decryption.
- PROM does not bypass encrypted/unsupported mute. DMR PROM stays on its chosen slot.
- 256 memories; 12 printable ASCII name characters; 16 zones/lists; up to 64 TGs per P25 TG list. No contact/alias database.
- No priority scan, nuisance delete, VOX or DTMF feature in this iteration.
- Power-level labels are not measured watts. TX timeout is 15-600 seconds. Keypad lock leaves PTT usable.
- Signal/battery icons are approximate, not calibrated instruments or runtime estimates.

Report reproducible behavior via [TESTING.md](TESTING.md), including failed/partial calls alongside successful retries.
