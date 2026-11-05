# DM32 Multimode

Private beta firmware bringing conventional **P25 Phase 1, DMR and analog FM** into one DM32 interface.

The first proposed package is **v0.1.0-beta.1**, based on source `05c496514bf9efe9bbb1a8f219b284228c814a60`. It is an early, non-mission-critical beta. Preparation of this repository does not mean a tag or GitHub release has been published.

## Start here

1. Read [known issues and the tested scope](KNOWN_ISSUES.md).
2. Follow [flashing instructions](FLASHING.md), including the backup and local native-codec preparation. **Do not flash the bare application binary.**
3. Use the [quick start](QUICK_START.md) to configure your own channels and radio ID.
4. Program memories with the included [browser CPS](docs/CPS.md).
5. Report results using the [tester guide](TESTING.md) or this repository's issue forms.

[Recovery instructions](RECOVERY.md) and [source/provenance information](SOURCE.md) are separate from ordinary radio programming.

## Included features

- Standalone microphone transmit and speaker receive; no PC arming for each call.
- Conventional clear P25 Phase 1 and DMR, plus native narrow/wide analog FM.
- 32 named memories, two retained A/B contexts and four scan lists.
- Per-channel frequencies, signaling, receive filters and receive-only selection.
- Shared digital radio ID and microphone gain; analog squelch and CTCSS/DCS controls.
- Larger received-call IDs, signal and battery icons, reception wake, keypad lock and adjustable light timeouts.
- A local browser CPS for the custom configuration format. CHIRP and stock/RadioFoundry codeplugs are not interchangeable with it.

A/B select between contexts on **one receiver**. This firmware does not provide simultaneous dual reception, trunking, P25 Phase 2 or decryption.

## What has been checked

The development unit passed firmware readback, retained-settings checks and preservation comparisons for its bootloader and factory calibration. P25 clear reception and speech/parrot operation have finite local test evidence. The DMR receive correction passed steady-tone and direct AnyTone speech checks. The latest DMR transmit correction passed a local speech call with all 288 encoded frames accounted for and no source, queue or native-modem underruns.

These results cover a development unit and controlled local tests. FM RF/audio, repeater operation, broader hardware/band coverage and extended endurance remain unqualified. See [release notes](RELEASE_NOTES.md) for the version-specific result and its limits.

## Package boundary

The repository does not distribute an owner's radio backup, calibration, personal codeplug or a merged native-codec image. The application under `firmware/v0.1.0-beta.1/` must be prepared locally as described in [FLASHING.md](FLASHING.md); the bare application alone is not a complete DMR installation.

Use your own frequencies, signaling and radio ID. Development test channels and IDs are not a suggested configuration.
