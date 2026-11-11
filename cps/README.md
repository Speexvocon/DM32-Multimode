# Browser CPS

**[Open the hosted CPS](https://speexvocon.github.io/DM32-Studio/)** in desktop
Chrome or Edge. This unchanged editor comes from source `2e0f18a` and supports firmware
v0.2.0-beta.1 and v0.2.0-beta.2 (`32f973f`), including V4's
256 channels, 16 zones and 16 Channel/P25 TG scan lists. Legacy V1–V3 radios/files
retain their original 32-channel format until an explicit working-copy upgrade.
Expanded data is never silently truncated onto older firmware.

For offline use, serve this directory on localhost:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory cps
```

Open `http://127.0.0.1:8765/`. Editing and importing are local; connect and read the
radio before reviewed writes. JSON is the complete backup. CSV imports/exports
handle channel records only. Bulk edits and slot moves preserve or validate
zone, scan and reply references.

See [CPS setup and programming](../docs/CPS.md). Firmware installation remains a
separate operation; updating or opening the CPS does not flash the radio.

Run the standalone offline checks from this directory with `npm test` (or
`node --test tests/*.test.js`). These tests use simulated serial streams and
never open a hardware port.
