# v0.3.0-beta.2 — control-channel reception and receive-only recovery

Firmware source `e799c73ab286c26648771cc91d2aaefad0c0a10b`; radio build
**e799c73**. This is the normal multimode firmware. Older release applications
and source archives remain unchanged.

- Decode supported FDMA channel identifiers carried in opcode `0x33`, alongside
  the existing identifier messages. Unsupported channel types remain refused;
  this does not add Phase 2 voice.
- Decode supported AMBT site/network announcements and clear group voice grants,
  with native framing and integrity checks before accepting their contents.
- Give candidates with genuine P25 evidence a bounded acquisition window.
  Valid control traffic can maintain an established lock while the required
  site/network identity remains fresh. Candidate changes discard old maps and
  decoder state; old-frequency messages cannot establish a new lock.
- Recover temporary recorder/input failures in saved receive-only systems:
  pause, retry the same candidate a limited number of times, then advance after
  a longer delay if setup still fails. Cancellation, programming, changed
  settings and unrelated faults cannot restart the old receive owner.
  Experimental subscriber failures keep their existing policy.
- Add **Do not affiliate (receive only)** to the CPS system editor. It is checked
  for new systems; existing saved modes are preserved. A receive-only saved
  system cannot register, affiliate or transmit, including when PTT is pressed
  or an inherited radio ID is present.

The settings format remains **V6**, unchanged from v0.3.0-beta.1. No conversion
is needed between these releases. Export complete JSON before updating.
Firmware and CPS source identities are recorded separately in the release
manifest. See [the CPS guide](docs/CPS.md) and [trunking guide](docs/TRUNKING.md).

## Exact-build validation and limits

Processor CI **44068616566** passed and ran 57 actual-controller cases before
building: three passive safety cases, 19 recovery cases and 35 subscriber
cases. Focused local checks also passed: 116 actual-C/CPS checks, the passive,
recovery and subscriber cases, 19 dedicated receive-profile regressions and
four strict compile configurations. A complete host-CI workflow was not run
for this revision.

The application is **522,804 bytes**. Linked static RAM is
**199,176 / 211,456 bytes**, leaving **12,280 bytes**. Only the codec-free
application is distributed; the installer still needs your radio's own sealed
original backup to prepare a complete update locally.

**No new RF test or field qualification is claimed for this revision.** These
receive changes have simulated controller coverage and a successful processor
build. Actual-site control lock, message cadence, weak-signal reception and
broader interoperability need beta feedback. Earlier local voice and trunking
results do not establish precise RF access-slot timing or compatibility with
arbitrary production systems. The mission-critical-use restriction and other
[known limits](KNOWN_ISSUES.md) remain in effect.

---

# v0.3.0-beta.1 — named P25 trunking and applet tools

Firmware source `686805368f63f1382e5024e2856aee0b555173be`; radio build **6868053**.
The separately refreshed CPS/flasher has its own source revision in the release
manifest; it is not represented as a firmware rebuild. Historical release
applications and source ZIPs remain unchanged.

- V6 named systems: eight systems, up to eight control channels each, selected
  system, optional start at power-on and per-system talkgroup.
- Phase 1 C4FM receive following and explicitly experimental registration,
  affiliation, granted voice and terminal completion reporting.
- V5 contacts/messaging alongside V4 memories, zones and TG/channel scan lists.
- Installable DAPP sandbox, Counter/SAME Watch packages and native PCM clients.
- Current capability-aware CPS and browser installer source, including the
  native Chromium fetch receiver correction.

Exact firmware host CI **43845372268** and target CI **43845372157** passed.
The application is **514,024 bytes**; linked RAM is **197,352 / 211,456 bytes**,
leaving **14,104 bytes**. The locally reconstructed owner package passed bounds,
sealed codec and checksum checks without hardware access. Only the codec-free
application is distributed.

Finite development runs demonstrated local control transactions, voice
transmission and receive following on preceding/current development candidates.
Those observations are not a calibrated RF access-slot, public-system,
multi-variant or endurance qualification. This package conservatively declares
the four native contracts as offline checked; no new hardware qualification for
all four profiles is implied. Browser flashing remains experimental.

Export complete JSON before upgrade. V6 adds records that older firmware cannot
read. Keep the older-format JSON needed for rollback; never truncate a V6 file.
See [installation](FLASHING.md), [trunking scope](docs/TRUNKING.md) and
[known issues](KNOWN_ISSUES.md).

---

# v0.2.0-beta.2 — preserve DMR audio after P25

Firmware source: `32f973f77e3b898c8e7bb7b6e3bb9fa64d865a25`; radio build **32f973f**. Previous release packages remain unchanged.

## Correction

A persistent P25 speaker worker could disable the shared PCM interrupt/output after P25 stopped, interrupting DMR playback even when DMR frames decoded correctly. The stopped worker now leaves that hardware alone. This fixes the shared output ownership; the vocoder, air framing and CPS format are unchanged.

Use the existing [DM32 Studio CPS](https://speexvocon.github.io/DM32-Studio/). V0.2.0-beta.1 and beta.2 share V4: 256 memories, 16 zones, 16 scan lists and up to 64 TGs per P25 list. There is no conversion or CPS update between these two releases. Keep an exported JSON backup and reuse your sealed original backup for preparation; see [FLASHING.md](FLASHING.md).

## Exact-build validation

- Host CI **43106099351** and processor CI **43106099505** passed at the exact source revision; the shared-output transition has host regression coverage, including the P25 scan transition.
- Application **302,868 bytes** (+12 from beta.1). Linked RAM remains **162,632 / 211,456 bytes**, with **48,824 bytes** headroom.
- Installed and independently read back on the development radio. Application/native-codec matching and bootloader, calibration and retained-settings checks passed; normal startup returned.
- One controlled hardware transition from **P25 LISTENING â†’ Channel / Modulation â†’ DMR CC1/TS2**, without power cycling, played a full steady nominal five-second hotspot tone on TG98638.

| DMR observation | Result |
| --- | ---: |
| Voice frames | 252 / 252 |
| PCM samples | 40,320 / 40,320 |
| PCM interrupts | 504 |
| Maximum interrupt gap | 10,031 Âµs |
| Lost / concealed frames | 0 / 0 |
| Queue starvation / overflow | 0 / 0 |
| Reset | 0 |

This is **one local tone/transition pass using the NRF/fanti 049 native codec**, not extended qualification or an RF BER measurement. P25 scan was **not running** in this hardware test; its transition is covered by host tests only. The test began with the retained existing four-channel configuration and included normal menu saves; it does not qualify full 256-channel/zone/list capacity. Other codec profiles retain their existing offline checks, without new physical voice/RF evidence. Two-way FM, repeater/split operation and broader hardware/band coverage remain as described in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

---

# v0.2.0-beta.1 — expanded codeplug and installer compatibility

Firmware source: `2e0f18ad2d47a20b78d00c0702fbe2307dddfd09`; radio build **2e0f18a**. The package version labels this exact application; it is not a rebuilt firmware version string. Previous v0.1.0-beta.1 is retained.

## Added

- **256 memories, 16 named zones and 16 named scan lists**.
- Distinct Channel scan and continuous P25 TG scan with up to 64 TGs on one base frequency/NAC.
- Per-list dwell/hold and Selected / Last heard / Fixed reply. Temporary heard-TG replies never overwrite the saved TX target.
- Matching [DM32 Studio CPS](https://speexvocon.github.io/DM32-Studio/): zones/lists, channel CSV, bulk editing and reference-safe movement. Legacy firmware/files remain supported.
- Programmable TX timeout/power, configurable buttons, receive-only broadcast FM and the five grouped menus from the intervening development revisions.
- Normal build with minimal status/fault diagnostics; extended lab captures excluded.

## Installer correction

New-release preparation detects four exact native contracts automatically: standard 046 (01.01/01.02), standard 049, NRF/fanti 049 and HR046. Earlier tools rejected standard 046 before flashing. No stock-049 upgrade or manual codec selection is needed when the tester's own sealed backup matches a verified profile.

`prepare-firmware.py codec-info` diagnoses an existing sealed backup offline. Default output is version-specific; valid repeat preparation reuses verified files, while invalid/changed output is never overwritten. Existing original backups remain reusable; each flash still makes a fresh preservation read and requires independent installed-image verification.

Standard 046 equivalence and HR046's separate map have offline comparison/layout/package evidence. HR046 voice remains physically unqualified. V0.1.0 keeps its original narrower codec gate. See [compatibility scope](KNOWN_ISSUES.md#native-codec-compatibility).

## Migration and rollback

Firmware reads V1-V3 without boot migration writes; the first explicit save atomically publishes V4. Existing four membership lists become Scan 1-4 with Last heard reply. V4 adds no automatic stock codeplug import. Export old JSON before upgrading: older firmware cannot read expanded configuration and its retained fallback may be stale. There is no lossless V4-to-legacy conversion.

## Exact-build validation

- Host CI **42162825624** and processor CI **42162825718** passed at the exact source revision.
- Application **302,856 bytes**; linked RAM **162,632 / 211,456 bytes**, leaving **48,824 bytes**. Codec workspace and receive union unchanged from the preceding minimal build.
- Storage interruption/migration, CH256/zone16/TG64/reply behavior, actual C/CPS integration, 20 simulated browser flows and updater-package checks passed.
- **This V4 geometry has not yet been flashed or physically qualified.** Earlier P25/DMR audio evidence below does not claim an exact-binary pass. New scan/reply behavior, added hardware variants, two-way FM, repeater/split operation and broader RF coverage remain beta feedback areas.

Use [FLASHING.md](FLASHING.md) for both fresh install and upgrade. No owner backup/calibration or merged native codec is distributed.

---

# v0.1.0-beta.1 — original private beta

Firmware source: `05c496514bf9efe9bbb1a8f219b284228c814a60`.

Retained historical package of the unified DM32 P25/DMR/FM application. Its original application, source and codec restriction remain unchanged.

## Included

- Unified normal radio controller, grouped menus, retained channel settings, memories, A/B contexts, filters, scan lists and browser CPS.
- Clear conventional P25 Phase 1 software voice path and native DMR AMBE+2 integration, sharing the hardware through explicit mode ownership.
- Native analog FM/NFM controls, with physical RF/audio qualification still pending.
- Dedicated PCM speaker output for DMR. The previous ring/FIFO route could produce cutouts despite complete decoded frames.
- DMR TX pacing correction: render the transmit view before RF admission, defer LCD transfers through the call and ending, and defer slow status/error output. The physical PTT is checked again after drawing the preview.
- Per-attempt controller timing and native-modem diagnostics. Codec algorithms, queue depths, requested header count and RF burst timing are unchanged by the pacing correction.

## Measured results

On the development unit, the complete locally prepared firmware was installed and independently read back. Application matching and bootloader, calibration and retained-settings comparisons passed; normal and cold startup returned with saved settings.

The latest controlled direct DMR speech call decoded clearly on an AnyTone and ended normally:

| TX observation | Earlier image | This image |
| --- | ---: | ---: |
| Encoded frames dropped | 14 | 0 |
| Source-silence insertions | 8 | 0 |
| Call-event overflows | 1 | 0 |
| Captured startup voice headers | 5 | 3 |

All 288 encoded/published voice frames were accounted for in the captured 96 voice bursts. Native modem underruns were zero, and maximum controller-poll gap was 16.156 ms. This is one local uplink pass, not endurance or all-condition qualification.

The hotspot reported approximately 0.3% protected AMBE-bit corrections. That metric is not calibrated full-air BER or deviation, and this release does not claim an RF-error improvement. An initial sync/receiver-phase anomaly remains under investigation.

The dedicated PCM receive path previously passed a full DMR test tone, direct AnyTone speech and a P25 tone after switching modes without restarting. Earlier P25 tests include smooth speech/parrot turnaround, PROM/NAC filtering, encrypted/unsupported mute and following clear-call recovery. These are finite observations across the recorded development images; they do not imply every path was retested on this exact binary.

## Open scope

Read [KNOWN_ISSUES.md](KNOWN_ISSUES.md) before installing. In particular, FM RF/audio, repeater/split operation, mixed-mode scan, broader hardware/band coverage and extended endurance remain unqualified. Uniden direct DMR uplink compatibility was not established by the latest pacing test.

The bare application is not a complete flashable DMR package. Prepare it locally with the correct preserved native codec according to [FLASHING.md](FLASHING.md). No owner's backup, calibration or merged native-codec image is included here.
