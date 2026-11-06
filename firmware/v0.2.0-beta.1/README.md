# 0.2.0-beta.1 — firmware 2e0f18a

This package contains the exact V4 application from source `2e0f18a`, with
successful host CI, target build and local package checks. It has not received
new hardware or RF qualification as part of this release preparation.

V4 adds 256 channel memories, 16 named zones and 16 named scan lists with
separate Channel and P25 talkgroup scan modes. Legacy settings remain readable;
future writes use the new atomic layout. Keep a pre-upgrade backup: older
firmware cannot read settings after they have been saved in V4 format.

**Do not flash the `.application.bin` file directly.** It intentionally omits the
native DMR codec. Prepare a complete update locally from your own sealed stock
backup, following [FLASHING.md](../../FLASHING.md). Preparation accepts only the
four exact native contracts in `release.json`: Standard 046, Standard 049,
NRF/fanti 049 and HR Vocoder 046. This is offline packaging support, not a new
hardware compatibility claim.

Use the matching [hosted CPS](https://speexvocon.github.io/DM32-Studio/) or the
[offline CPS](../../cps/README.md). V1–V3 files/radios keep their 32-channel format
until an explicit working-copy upgrade. Expanded data is never truncated onto
older firmware. The complete matching source is in
[source/0.2.0-beta.1-project.zip](../../source/0.2.0-beta.1-project.zip).

The earlier 0.1.0-beta.1 firmware and source archives remain unchanged.
`release.json` records this application's checksum and exact source revision.
