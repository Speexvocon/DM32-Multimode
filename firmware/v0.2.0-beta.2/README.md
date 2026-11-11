# 0.2.0-beta.2 — firmware 32f973f

This update fixes P25-to-DMR audio ownership: the stopped P25 speaker task no
longer disables the PCM output after DMR takes over. It retains beta.1's V4
codeplug, 256 memories, zones, scan lists and compatible CPS.

The exact application passed host CI and the processor build. Installation and
independent readback preserved the bootloader, native codec, calibration and
saved settings on one owner radio using the NRF/fanti 049 codec. A local
P25-listening-to-DMR menu transition, without restarting, played the full steady
5.04-second tone: 252 voice frames and 40,320 audio samples, with no lost frames,
speaker starvation, overflow or restart. Scan was not running in this hardware
check; scan handoff is covered by the host regression. Other codec variants and
the full 256-channel capacity have no new physical qualification.

**Do not flash the `.application.bin` directly.** It omits the native DMR codec.
Follow [FLASHING.md](../../FLASHING.md) to prepare a complete update from your own
sealed stock backup. Returning testers can reuse that backup; preparation
automatically recognizes the four exact native contracts in `release.json`.

Use [DM32 Studio CPS](https://speexvocon.github.io/DM32-Studio/) or the
[offline copy](../../cps/README.md). Its runtime is unchanged from beta.1. Export
your configuration before updating. Beta.1 and beta.2 share V4; older V1–V3
settings remain readable, while rollback to firmware before V4 requires the
matching earlier configuration backup.

Matching source: [0.2.0-beta.2-project.zip](../../source/0.2.0-beta.2-project.zip).
`release.json` records the exact source, application hash and qualification
scope. Earlier firmware packages and source archives remain unchanged.
