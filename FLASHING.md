# Install or update the DM32 Multimode beta

For **DM-32UV / DM32 only**, using its USB serial programming cable. The current package is **v0.2.0-beta.1 / build 2e0f18a**. Its bare application is **not directly flashable**: the offline preparer adds the correct native codec from your own sealed backup.

Use a charged battery and a reliable cable. Close CPS and every other program using the COM port. Keep the normal USB serial driver: **no DFU or Zadig driver replacement is needed**. PTT stays released except when entering the updater as directed.

## Upgrading an existing beta

1. Before flashing, open [DM32 Studio CPS](https://speexvocon.github.io/DM32-Studio/), **Read radio**, and export the complete JSON. Close its serial connection afterward. CSV is not a full backup.
2. Reuse the **sealed original backup from this same physical radio** and its original radio label. Do not replace it with a backup of the beta or use another radio's backup. There is no need to repeat the two-read backup process if that backup is already sealed and intact.
3. Update/download this repository, then follow setup, offline preparation, flash and independent verification below. Every flash still makes a **fresh preservation read** to check bootloader and factory calibration.

V0.2.0 reads saved V1-V3 settings without a boot-time migration write. The first explicit save publishes V4. The new CPS reads legacy firmware/files; use **Upgrade codeplug** to convert an older JSON draft before writing it to V4 firmware. Review the resulting zones/lists and keep the original JSON.

**Rollback:** earlier firmware cannot read V4's expanded memories/zones/lists. It may load a retained legacy fallback, which is not a complete copy of your latest configuration. To recover your earlier beta configuration, reinstall that version with its package, then write its saved compatible JSON using CPS. There is no lossless V4-to-legacy conversion. [Stock recovery](RECOVERY.md) restores your original application/codec separately.

## 1. Set up the tools

Install Python **3.10 or later**, download/clone this repository, and open PowerShell in its root folder:

```powershell
py -3 -m venv .venv
$python = '.\.venv\Scripts\python.exe'
& $python -m pip install -r requirements.txt
& $python -m serial.tools.list_ports
```

If `py` is unavailable, use `python -m venv .venv` for the first command. No environment activation or execution-policy change is required. If `.venv` already exists, reuse it and rerun the requirements command.

Set your own port, unique physical-radio label, backup path and release. The examples are placeholders:

```powershell
$radioPort = 'COM5'
$radioLabel = 'my-dm32-serial'
$backup = '.\backups\my-dm32-before-beta'
$release = '.\firmware\v0.2.0-beta.1\release.json'
```

Use letters, digits, `-` or `_` in the label. A returning user must keep the label already sealed with their backup. The label binds files together; it does not electronically authenticate the radio.

## 2. Seal your original backup - new users only

If your existing original backup already passes `inspect`, skip this step.

Switch **OFF**, remove the battery for ten seconds, refit it with the switch **OFF**, and connect the cable. With the radio still off, run:

```powershell
& $python tools/radio-safety.py backup --directory $backup --radio-label $radioLabel --firmware 'ACTUAL INSTALLED VERSION' --port $radioPort --execute
```

At the reader's cue, turn **ON normally, without holding buttons**. A blank screen is expected: a read-only monitor is running in RAM. The tool reads the complete **1 MiB program and 16 MiB data flash twice**. Allow tens of minutes at the conservative transfer speed; do not unplug, restart or remove the battery between reads.

Wait for **`SEALED: two matching full reads`**. Keep the entire folder, including `program.bin`, `data.bin`, `readback/`, `restore-application.bin`, calibration copies and checksum manifest. Copy it to another storage device. A stock CPS codeplug cannot replace it. Keep all backup and generated codec files private.

After the reader closes, switch off. Remove/refit the battery if needed to exit the RAM monitor. An incomplete backup is never overwritten: retain it for diagnosis and choose a new folder for a retry. If the radio boots its normal interface instead of showing a blank screen, stop, power off, reseat the radio-side plug and retry from a cold start.

## 3. Detect the codec and prepare offline

These commands open **no serial port**:

```powershell
& $python tools/radio-safety.py inspect --directory $backup --radio-label $radioLabel
& $python tools/prepare-firmware.py codec-info --backup $backup --radio-label $radioLabel --release $release
& $python tools/prepare-firmware.py --backup $backup --radio-label $radioLabel --release $release
$package = ".\build\$radioLabel\0.2.0-beta.1\package.json"
```

Codec selection is automatic. The tool accepts exact verified standard 046, standard 049, NRF/fanti 049 and HR046 contracts, checks code/tables and relocation layout, then validates the complete merged update. No separate stock download, manual selection or stock-049 upgrade is needed when your backup matches a profile. HR046 has offline layout/package checks; its voice behavior still needs physical feedback.

If detection refuses an unknown/damaged codec, retain the exact error and ask the maintainer. **Do not force it, edit the manifest or substitute another radio's files.** Detection/preparation cannot erase or flash anything. Power-cycle normally if the radio is still in the RAM reader.

Default private output for this release:

```text
build/<radio-label>/0.2.0-beta.1/package.json
build/<radio-label>/0.2.0-beta.1/application-codec.bin
build/<radio-label>/0.2.0-beta.1/application-codec_BFUV32.bin
```

A repeat command safely reuses an already verified package for the same backup/release. Changed or invalid existing output is never overwritten. To make a separate package, use `--output .\build\my-new-package`, then set `$package` to its `package.json`. Use the generated manifest with the flash helper; never hand the bare application to an updater.

## 4. Review, then flash

First review the offline plan:

```powershell
& $python tools/flash-firmware.py flash --backup $backup --radio-label $radioLabel --package $package --port $radioPort
```

Switch **OFF**, remove/refit the battery after ten seconds, leave the switch **OFF** and cable connected, then run:

```powershell
& $python tools/flash-firmware.py flash --backup $backup --radio-label $radioLabel --package $package --port $radioPort --execute
```

There are **two different power-on steps**, prompted in order:

| Phase | What to do | Expected result |
| --- | --- | --- |
| Preservation reader | Turn ON **normally, no buttons**, only at its cue | Blank screen; fresh program/data read and bootloader/calibration checks |
| Factory updater, after checks pass | Switch OFF; hold **PTT + SK1** (side key immediately below PTT); turn ON; release both at **green LED** | Updater identifies **BFUV32-V2** |

Keep the same labeled radio connected. At the updater prompt, press Enter in the terminal after entering factory mode. Review and answer its confirmation; allow erase/transfer to finish without touching power or cable. Application and ordinary setting differences from the original backup are allowed; protected bootloader/calibration mismatches stop the process.

Only the application/codec region starting at `0x0300C000` is written. The bootloader and external data flash are not written by this updater. **Transfer completion is not the final verification.**

## 5. Independently verify the installation

After transfer closes, switch **OFF**, remove the battery for ten seconds, refit it with the switch **OFF**, and keep the cable connected:

```powershell
& $python tools/flash-firmware.py verify-installed --backup $backup --radio-label $radioLabel --package $package --port $radioPort --execute
```

At the reader's cue, turn **ON normally, no buttons**. Its independent read must match the complete prepared application/codec, original bootloader and factory calibration. Wait for **`VERIFIED`**. The readback and `verification.json` stay in a new check folder inside your backup. Ordinary settings may legitimately differ after a normal boot.

When the reader closes, switch off, remove/refit the battery, then turn on normally with PTT released. The home screen should return; find build **2e0f18a** under **Tools → Diagnostics → Radio status**. Keep the package and verification result with your original backup.

## 6. Configure and use

Open [DM32 Studio CPS](https://speexvocon.github.io/DM32-Studio/) or follow [QUICK_START.md](QUICK_START.md). Set your own radio ID, frequencies, signaling, power and TX permission. Stock codeplugs are **not automatically imported**. New-user defaults are neutral examples, not the maintainer's personal channels or ID and not a ready-to-transmit configuration. Normal calls need no PC arming; test modes/inhibit remain menu choices.

Close the PC serial session and remove the **radio-side programming plug** for normal mic/speaker use: it affects audio routing. Check a known receive source, then one short call to a known receiver. Codec compatibility checks do not establish RF/audio qualification on every variant.

## Common installation questions

| Symptom | Action |
| --- | --- |
| COM port busy / access denied | Click Disconnect in browser CPS, close stock CPS/serial terminals and retry with the radio off at the required cue |
| Blank screen after reading | Expected RAM-monitor state; let the tool finish/close, then remove/refit the battery and boot normally |
| Unsupported codec | Update this repository and run `codec-info` against the existing sealed backup; send its exact output. No extra backup read or stock upgrade is required for diagnosis |
| No internal mic/speaker audio | Close the PC serial session and remove the radio-side programming plug |
| Wrong/stale channels after rollback | Restore the older version's compatible JSON through CPS; expanded V4 is not readable by older firmware |

For a failure, keep the full error, detected codec name, version and logs. Use [RECOVERY.md](RECOVERY.md); never flash the complete `program.bin` as an application or copy another radio's calibration.
