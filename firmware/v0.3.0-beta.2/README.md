# DM32 Multimode 0.3.0-beta.2

Radio build **e799c73**; exact firmware source `e799c73ab286c26648771cc91d2aaefad0c0a10b`.
Use [installation instructions](../../FLASHING.md) and your own retained original
backup. This application excludes the native codec and must be prepared locally;
**do not flash the bare application**.

This update adds shared P25 FDMA identifier/AMBT support, steadier control-channel
acquisition and lock retention, and bounded receiver recovery for saved passive
systems. In [DM32 Studio](https://speexvocon.github.io/DM32-Studio/), open
**Trunking → Edit system → Do not affiliate (receive only)** to follow the selected
talkgroup without registration, affiliation or trunked transmission. New systems
default to receive only; existing saved modes and the V6 format are preserved.

Processor build **44068616566**, 116 actual-C CPS tests, focused controller
regressions and four strict configurations passed. Application: **522,804 bytes**.
Linked RAM: **199,176 / 211,456 bytes**, leaving **12,280 bytes**.
Application SHA-256: `23f808a44acb504c8148846ded9c79fe56517875622f4595ca925fcfb4bcd46a`.

The exact source and its privacy adjustments are documented in
[SOURCE.md](../../SOURCE.md). Read [release notes](../../RELEASE_NOTES.md) and
[known issues](../../KNOWN_ISSUES.md). This revision has no new physical-radio or
RF qualification. Phase 2, CQPSK, encrypted voice and calibrated access-slot
alignment remain outside the qualified scope. The normal multimode firmware is
included; this is not the fixed Omaha-only receiver image.
