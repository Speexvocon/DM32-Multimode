# DM32 Multimode

Beta firmware for conventional P25 Phase 1, DMR and analog FM, with named
P25 trunking systems, contacts/messaging and installable radio applets.

Current: **v0.3.0-beta.1**, radio build **6868053**. The firmware and separately
updated CPS have exact source identities in the [release manifest](firmware/v0.3.0-beta.1/release.json).
Older firmware and source archives remain available unchanged.

1. Follow [installation](FLASHING.md). Reuse your own sealed original backup;
   prepare the codec-free application locally before any transfer.
2. Use [DM32 Studio](https://speexvocon.github.io/DM32-Studio/) and its
   [CPS guide](docs/CPS.md). Export complete JSON before upgrading.
3. Read [quick start](QUICK_START.md), [trunking](docs/TRUNKING.md),
   [applets](docs/APPLETS.md) and [known limits](KNOWN_ISSUES.md).

The V6 codeplug has 256 memories, two A/B contexts, 16 zones, 16 scan lists,
96 contacts and eight named trunking systems with up to eight control channels
each. P25 TG lists hold up to 64 groups. A/B share one physical receiver.
Clear conventional P25/DMR, native FM, receive filters, channel power, digital
mic gain and the 15–600-second timeout remain available.

Trunking supports Phase 1 C4FM clear group-call following. Receive-only systems
and explicitly experimental subscriber systems are separate. Local functional
tests do not qualify calibrated RF access-slot timing, public-site interoperability,
Phase 2, CQPSK, multi-site roaming or endurance. Encryption remains muted.

The [applet packages](applets/README.md) and their compiler/client are included.
The sandbox VM is bounded and receive-only; native PCM endpoints are separate.

Exact firmware host/target CI and offline layout/package checks passed.
Application size: **514,024 bytes**. Linked RAM: **197,352 / 211,456 bytes**;
headroom: **14,104 bytes**. Read version-specific [qualification](RELEASE_NOTES.md).

This repository is publicly readable. No owner backup, calibration, personal
codeplug, native codec, merged owner image or voice capture is distributed.
Keep locally generated packages and personal JSON private. See [source](SOURCE.md),
[recovery](RECOVERY.md) and [feedback](TESTING.md).
