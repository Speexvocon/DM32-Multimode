# Known issues and scope

Current package: **v0.3.0-beta.2 / e799c73**. Focused host regressions, the
processor build and offline package checks passed for the exact firmware.
The new receive fixes have no new RF qualification. Earlier physical evidence
is finite and comes from a small local development setup, not a general
interoperability program.

## Trunking

- Phase 1 C4FM clear group calls only. Phase 2, CQPSK, encrypted calls,
  authentication, vendor regrouping/patches and multi-site roaming are outside
  the supported scope.
- Receive-only following and experimental subscriber operation are distinct.
  A locally successful request/reply/voice exchange does not qualify actual RF
  access-slot phase or operation on arbitrary production systems.
- Control search, grant following, voice termination and return behavior need
  broader site, band, weak-signal and endurance feedback.
- The additional FDMA/AMBT announcements, control-lock maintenance and bounded
  receive-only recovery in beta.2 have simulated controller coverage but need
  field feedback. They do not guarantee compatibility with every site's
  control-channel message mix or timing.
- CPS **Do not affiliate (receive only)** defaults on for new systems. Existing
  systems keep their saved mode; inspect it before writing or starting one.
- P25 trunking is not simultaneous dual receive. A/B select one receiver.

## Configuration, audio and applets

- V6 adds named systems after V5 contacts and V4 expanded memories. Older
  firmware cannot read newer records. Export JSON before upgrades and retain
  the older-format JSON for rollback; CSV contains channels only.
- The radio-side programming plug changes internal mic/speaker routing.
  Disconnect serial software and remove that plug for internal audio comparisons.
- Sandbox applets have bounded storage/execution and no transmit opcode.
  Native PCM RX/TX is a separate explicit service. Actual SAME alert-header
  reception and broad PCM cable/rate compatibility remain limited test areas.
- Browser programming/flashing host simulations do not replace physical
  transfer qualification. Keep the CLI recovery path and original backup.
- FM RF/audio, power/deviation accuracy, weak-signal coverage, mixed-mode
  scanning, repeater/private-call combinations, full-capacity writes and long
  soak testing need broader physical evidence. Icons and power labels are not
  calibrated instruments.

## Native-codec compatibility

Offline preparation accepts exact Standard 046, Standard 049, NRF/fanti 049 and
HR Vocoder 046 contracts from your own sealed backup. Exact code/table hashes,
placement and relocations are checked. Other/altered contracts are refused.
The new release does not claim fresh physical qualification on every profile;
HR046 voice remains physically unqualified. RF-B / NRFB.050 remains incompatible
with this classic-board release. Historical releases keep their original gates.

No stock codeplug import, CHIRP interchange or decryption is provided. Report
reproductions with version/mode/context using [TESTING.md](TESTING.md).
