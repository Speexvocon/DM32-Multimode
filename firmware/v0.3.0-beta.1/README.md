# DM32 Multimode 0.3.0-beta.1

Firmware build `6868053`; exact source `686805368f63f1382e5024e2856aee0b555173be`. This codec-free application is
514,024 bytes, SHA-256 `013e162f9665b4e59e1d8c2674c8f7dc39d98ddef8e93f0c099211c575a79dad`. It starts at `0x0300C000` and excludes the
native codec slot. **Prepare it locally with your own qualified sealed backup;
do not flash the bare application.** See [installation](../../FLASHING.md).

Host CI 43845372268 and target CI 43845372157 passed for this exact firmware.
Linked RAM is 197,352 / 211,456 bytes, leaving 14,104 bytes. Source and build
provenance, privacy edits and hashes are in [SOURCE.md](../../SOURCE.md).
The separately updated CPS has its own source identity in `release.json`.

This beta adds V6 named trunking systems and includes contacts/messaging,
sandbox applets and native PCM tools. Experimental subscriber operation is
distinct from receive-only following. Read [scope](../../KNOWN_ISSUES.md).
The package does not qualify calibrated access-slot phase, public-system
interoperability, additional hardware variants or endurance.
