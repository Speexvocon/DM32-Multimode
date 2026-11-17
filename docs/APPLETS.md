# Installable applets and native PCM

The installed firmware supplies a bounded receive-only script VM. Applet
packages live in eight logical slots in a 1MiB external data-flash partition;
an install validates the partition/package and does not start the script.
Foreign contents are refused rather than formatted. Applets do not start at boot.
Normal CPS settings are separate; JSON codeplugs do not back up applet slots.

Counter and SAME Watch sources/packages are in [applets/](../applets/README.md).
From this repository, these commands are offline:

```powershell
python tools/dm32-applet.py inspect applets/counter.dapp
New-Item -ItemType Directory -Force build | Out-Null
python tools/dm32-applet.py compile applets/counter.dappsrc -o build/counter.dapp
```

With the radio powered normally, use your actual port and close other serial
programs before an explicit install/run:

```powershell
python tools/dm32-applet.py install applets/counter.dapp --slot 1 --port COM5
python tools/dm32-applet.py run 1 --port COM5
python tools/dm32-applet.py stop --port COM5
```

The radio menu is **Tools → Applets**; refresh the slot list when needed.
Back stops an app. `python tools/dm32-apps.py --port COM5` opens the interactive
terminal; its `help` lists install/run/stop and native SAME commands.
SAME Watch uses NOAA frequencies and confirms repeated metadata before display;
actual over-air alert decoding needs broader feedback.

Scripts have eight integer registers, bounded strings and instruction/work
limits, with no filesystem, arbitrary register access, native code or transmit
opcode. Keep sources/packages for backup. The separate native PCM endpoint
offers explicit RAW/VOICE RX/TX sessions using `tools/dm32-pcm.py`; check its
`--help` before use. PCM is 8kHz mono signed16LE. Cable/rate support and RF
interoperability remain test-dependent; the sandbox VM never processes samples.
