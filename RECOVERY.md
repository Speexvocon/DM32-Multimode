# Recovery and returning to your original firmware

Use the complete, sealed backup made from **this same physical radio** before
installing the beta. The recovery helper restores its saved application and
native codec. It does not replace the bootloader or write external data flash.

## Roll back to an earlier beta

Keep the full JSON exported before upgrading. Prepare/install the earlier release using its explicit `--release firmware/<version>/release.json` and that version's `package.json`, then independently verify it using [FLASHING.md](FLASHING.md). Close CPS before flashing. Earlier release folders remain available; v0.1.0 retains its original NRF/fanti-only codec contract.

Older firmware cannot read V4's extra memories, zones and scan records. Its legacy fallback may be stale. After restoring a compatible earlier beta, use DM32 Studio to read the radio and write the saved older-format JSON; never force or truncate a V4 file. New V4-only data has no lossless older-format conversion.

## Restore your original stock application

Close CPS and serial sessions. Use a charged battery and keep the same radio and
cable connected. From PowerShell in this repository, with your actual values:

```powershell
$python = '.\.venv\Scripts\python.exe'
$radioPort = 'COM5'
$radioLabel = 'my-dm32-serial'
$backup = '.\backups\my-dm32-before-beta'
& $python tools/radio-safety.py inspect --directory $backup --radio-label $radioLabel
& $python tools/flash-firmware.py restore --backup $backup --radio-label $radioLabel --port $radioPort
```

The final command is an **offline plan**. To perform it, switch the radio off,
remove its battery for ten seconds, refit it with the switch off, and run:

```powershell
& $python tools/flash-firmware.py restore --backup $backup --radio-label $radioLabel --port $radioPort --execute
```

When the RAM reader asks, turn **ON normally, without holding buttons**. A blank
screen is expected. It reads the memories and checks the bootloader and original
calibration. Once those checks pass, enter factory update mode when prompted:

1. Switch **OFF**.
2. Hold **PTT + SK1** (the side key immediately below PTT), then turn **ON**.
3. Release both when the **green LED** lights.
4. Press Enter in the terminal. Require **BFUV32-V2**, then allow erase and
   transfer to finish without disconnecting power or the cable.

The helper flashes `restore-application.bin`: bytes from program offset `0xC000`
through the end of flash. It deliberately excludes the bootloader. **Never pass
the complete 1 MiB `program.bin` as an application image.**

After completion, perform the readback below if practical, then cold-restart normally with PTT released. Original firmware
should return. Ordinary settings or channels may need reloading with the
appropriate original CPS if you changed them. The beta's retained settings are
separate from the stock codeplug; restoring the application is not a data-flash restore.

For an optional strict readback against the original backup, before changing
settings or normally booting if possible:

```powershell
& $python tools/radio-safety.py verify-radio --directory $backup --radio-label $radioLabel --port $radioPort --execute
```

Start with the radio off; turn on normally at the reader cue. This compares both
complete memories to the original backup. Normal boot/settings updates may cause
legitimate data differences. The tool preserves the new `check-*` reads for
inspection and does not automatically overwrite anything.

## If an update was interrupted or the application will not boot

An incomplete application does not by itself mean the factory update loader is
gone. Re-enter **PTT + SK1** update mode. The guarded restore also permits an
erased/changed application if the bootloader and calibration still match.

If communication fails, stop the process, close any other COM-port connection,
power off, remove the battery for ten seconds and reseat the radio-side plug.
Verify the correct COM port, then retry. Record the complete error rather than
forcing a model or bypassing a mismatch. Keep a manufacturer firmware/updater
known to match your exact hardware revision as a separate recovery option.

## Calibration and recovery limits

The backup contains the exact original factory calibration pages, fallback copy,
complete data flash, bootloader and firmware. Keep all of them private and copy
them to another storage device. **Never transplant calibration from another radio.**

These helpers intentionally do not implement raw calibration/data-flash restore,
bootloader replacement, automatic rollback or a dual-bank update. Application
reflashing cannot repair damaged calibration or hardware. If protected-data
comparison fails, retain the logs and backups and contact the maintainer before
further writes; a separate service-tool/programmer procedure would need validation.

The underlying factory-update and readback procedure passed on the development
DM32 using the development tools. These portable beta wrappers have offline
host-test coverage. The current 2e0f18a/V4 package and additional codec profiles
have offline build/package validation, not a physical installation pass. A complete
stock restore on a second radio has not been qualified.
