# v0.1.0-beta.1 — proposed first private beta

Firmware source: `05c496514bf9efe9bbb1a8f219b284228c814a60`.

This is the first proposed private-beta package of the unified DM32 P25/DMR/FM application. Repository preparation does not establish an existing tag or published GitHub release.

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
