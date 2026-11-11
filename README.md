# DM32 Multimode

Beta firmware bringing conventional **P25 Phase 1, DMR and analog FM** into one DM32 interface.

The current package is **v0.2.0-beta.2**, source `32f973f77e3b898c8e7bb7b6e3bb9fa64d865a25` (radio build `32f973f`). Previous v0.2.0-beta.1 and v0.1.0-beta.1 packages remain available. This is an early, non-mission-critical beta; read the version-specific qualification limits before installing.

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

Before flashing, use CPS to **Read radio** and export the complete JSON configuration. Updating from v0.2.0-beta.1 requires no codeplug conversion or CPS update. Keep that file for rollback. The new CPS supports earlier firmware; opening its website does not update the radio.

V0.2.0 reads saved V1-V3 settings without a startup migration write. The first explicit settings save publishes V4. Earlier firmware cannot read the expanded configuration; never use a 256-channel file as an older-radio backup. See [upgrade and rollback details](FLASHING.md#upgrading-an-existing-beta).

## Validation and package boundary

V0.2.0-beta.2 fixes DMR audio after switching from P25: a stopped P25 speaker worker no longer disables the shared DMR PCM interrupt/output. Exact build 32f973f passed host CI, processor/package checks, installation and independent readback, preserving bootloader, native codec, calibration and saved settings.

One controlled transition from P25 LISTENING to DMR without a restart played a full steady five-second hotspot tone, with all 252 voice frames accounted for and no lost/concealed frames, queue faults or reset. This used the development radio's NRF/fanti 049 codec. P25 scan was not running; scan-to-DMR coverage is a host regression, not this hardware result. Full 256-channel/zone/list capacity and other hardware/codec variants remain broader beta feedback areas.

The normal application is 302,868 bytes and uses 162,632 of 211,456 linked RAM bytes. Minimal status/fault diagnostics are retained; extended lab capture paths are excluded from the normal build.

No owner's backup, calibration, personal codeplug or merged native-codec image is distributed. Prepare the codec-free application in `firmware/v0.2.0-beta.2/` locally using [FLASHING.md](FLASHING.md). Automatic codec detection supports verified standard 046/049, NRF/fanti 049 and HR046 contracts. Their validation levels differ: see [known issues](KNOWN_ISSUES.md#native-codec-compatibility).
