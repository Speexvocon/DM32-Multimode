# DM32 Multimode

Private beta firmware bringing conventional **P25 Phase 1, DMR and analog FM** into one DM32 interface.

The current package is **v0.2.0-beta.1**, source `2e0f18ad2d47a20b78d00c0702fbe2307dddfd09` (radio build `2e0f18a`). The previous v0.1.0-beta.1 package remains available. This is an early, non-mission-critical beta; read the version-specific qualification limits before installing.

## Start here

1. Follow [installation](FLASHING.md). New users make a sealed original backup; returning users can reuse their own existing sealed backup. **Do not flash the bare application binary.**
2. Configure your own radio ID and channels using [DM32 Studio CPS](https://speexvocon.github.io/DM32-Studio/) or the radio menu. [CPS instructions](docs/CPS.md) cover local/offline use too.
3. Read the [quick start](QUICK_START.md), [known issues](KNOWN_ISSUES.md) and [release notes](RELEASE_NOTES.md).
4. Report results using the [tester guide](TESTING.md) or this repository's issue forms.

Keep the full backup and locally generated codec package private. [Recovery](RECOVERY.md) and [matching source](SOURCE.md) are included.

## Included features

- Standalone microphone transmit and speaker receive; no PC arming for each call.
- Conventional clear P25 Phase 1 and DMR, plus native narrow/wide analog FM.
- **256 named memories, 16 zones, 16 named scan lists** and two retained A/B contexts.
- Separate **Channel scan** and continuous **P25 talkgroup scan**, up to 64 TGs per list; per-list timing and Selected / Last heard / Fixed reply.
- Per-channel RX/TX frequencies, power, signaling, receive filters and receive-only selection.
- Shared digital radio ID and mic gain; analog squelch and CTCSS/DCS controls; programmable 15-600-second TX timeout.
- Larger received-call IDs, signal/battery icons, reception wake, keypad lock, light timeouts and configurable button actions.
- Receive-only FM broadcast tuner, separate from two-way FM channels.
- Browser CPS with zone/list editors, CSV channels, bulk edits and reference-safe channel moves. CHIRP and stock/RadioFoundry codeplugs are not interchangeable with this format.

A/B select between contexts on **one receiver**. There is no simultaneous dual reception, trunking, P25 Phase 2 or decryption.

## Upgrading from an earlier beta

Before flashing, use CPS to **Read radio** and export the complete JSON configuration. Keep that file for rollback. The new CPS supports earlier firmware; opening its website does not update the radio.

V0.2.0 reads saved V1-V3 settings without a startup migration write. The first explicit settings save publishes V4. Earlier firmware cannot read the expanded configuration; never use a 256-channel file as an older-radio backup. See [upgrade and rollback details](FLASHING.md#upgrading-an-existing-beta).

## Validation and package boundary

The exact 2e0f18a application passed host CI, processor build, migration and complete updater-package checks. The expanded V4 geometry has **not yet been flashed or physically qualified**. Earlier development builds have finite local evidence for P25 speech/filtering and DMR speech/PCM audio/pacing; those observations do not establish a hardware pass for this new binary.

The normal application is 302,856 bytes and uses 162,632 of 211,456 linked RAM bytes. Minimal status/fault diagnostics are retained; extended lab capture paths are excluded from the normal build.

No owner's backup, calibration, personal codeplug or merged native-codec image is distributed. Prepare the codec-free application in `firmware/v0.2.0-beta.1/` locally using [FLASHING.md](FLASHING.md). Automatic codec detection supports verified standard 046/049, NRF/fanti 049 and HR046 contracts. Their validation levels differ: see [known issues](KNOWN_ISSUES.md#native-codec-compatibility).
