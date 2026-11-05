# Install the DM32 Multimode beta on Windows

This guide is for the **DM-32UV / DM32 only**, using its USB serial programming
cable. Beta 0.1.0-beta.1 contains P25 Phase 1 conventional, DMR and analog FM.
The firmware binary in `firmware/` is an application, **not a complete file to
flash directly**. First make your own backup and prepare a complete update with
your radio's own native codec. No compiler or separate stock firmware download
is needed when the backup contains the qualified codec.

Use a charged battery and a reliable cable. Keep PTT released throughout the
installation. Close CPS, browser serial connections and other programs using the
COM port. Keep the cable's normal USB serial driver; this procedure does not use
USB DFU or require replacing the driver with Zadig.

## 1. Set up the tools

Install Python **3.10 or later** and download/clone this repository. Open
PowerShell in the repository folder. These commands use the virtual environment's
Python directly, so activation and PowerShell execution-policy changes are unnecessary.

```powershell
py -3 -m venv .venv
$python = '.\.venv\Scripts\python.exe'
& $python -m pip install -r requirements.txt
& $python -m serial.tools.list_ports
```

If the `py` launcher is unavailable, use `python -m venv .venv` for the first
command. Identify your cable in the port list or Windows Device Manager. Replace
the following examples with your own port, unique physical radio label and
actual currently installed firmware version:

```powershell
$radioPort = 'COM5'
$radioLabel = 'my-dm32-serial'
$backup = '.\backups\my-dm32-before-beta'
```

Use a simple label containing letters, digits, `-` or `_`. It binds the generated
package to this backup; it does not electronically authenticate the radio.

## 2. Make and preserve your original backup

Switch the radio **OFF**, remove the battery for ten seconds, refit it with the
switch still **OFF**, and connect the cable. Start this command while it remains
off:

```powershell
& $python tools/radio-safety.py backup --directory $backup --radio-label $radioLabel --firmware 'ACTUAL INSTALLED VERSION' --port $radioPort --execute
```

When the reader asks, turn the radio **ON normally, without holding any buttons**.
A blank screen is expected: a temporary read-only monitor is running in RAM.
The tool reads the complete **1 MiB program flash and 16 MiB data flash twice**.
Do not restart, remove the battery or unplug between these reads. At the
conservative transfer rate, allow tens of minutes; progress remains in the terminal.

Continue only after `SEALED: two matching full reads` appears. It saves:

- `program.bin`: original bootloader, application and native codec.
- `data.bin`: original settings, contacts and calibration.
- `readback/`: the second complete matching read.
- `restore-application.bin`, calibration copies and the checksum manifest.

Copy the **entire backup folder** to another storage device. A stock CPS codeplug
alone cannot replace this backup. The backup and any locally prepared update
remain private; do not upload them to GitHub or attach them to bug reports.

The reader closes when finished. Switch off and leave the radio off for the
later flash command. If the RAM monitor prevents switching off, remove/refit the
battery after the tool has finished.

An existing folder is never overwritten. For a failed/incomplete attempt, retain
it for diagnosis and choose a new backup directory. If the screen boots normally
instead of entering the reader, stop the tool, power off, reseat the plug and retry
from a cold start; do not bypass the backup.

## 3. Prepare your update, entirely offline

```powershell
& $python tools/radio-safety.py inspect --directory $backup --radio-label $radioLabel
& $python tools/prepare-firmware.py --backup $backup --radio-label $radioLabel
$package = ".\build\$radioLabel\package.json"
```

The preparer checks the sealed backup and released application, recognizes the
native codec in **your own program backup**, merges it into its reserved slot and
checks the resulting package. It opens no serial port. The private files are:

```text
build/<radio-label>/package.json
build/<radio-label>/application-codec.bin
build/<radio-label>/application-codec_BFUV32.bin
```

The first beta accepts only the native codec variant already qualified with this
firmware. If it reports an unsupported or unqualified codec, save the message and
ask the maintainer about your stock version. **Do not force it or substitute a
different radio's backup or calibration.** Broader codec support can be added later.

Preparation refuses an existing output directory. For a later package, select a
new directory under `build/` with `--output`, then point `$package` to its
`package.json`. The generated package must include the complete native codec:
factory update mode erases that application/codec area.

## 4. Review and flash

First run the offline plan:

```powershell
& $python tools/flash-firmware.py flash --backup $backup --radio-label $radioLabel --package $package --port $radioPort
```

With the radio **OFF** and cable connected, repeat with `--execute`:

```powershell
& $python tools/flash-firmware.py flash --backup $backup --radio-label $radioLabel --package $package --port $radioPort --execute
```

This command first enters the same RAM reader: turn **ON normally, without
buttons**, only when the reader asks. It reads both memories and checks the
bootloader and factory calibration against your sealed backup. Application or
ordinary settings differences are allowed. Keep the same labeled radio connected.

Only after preservation checks pass will the updater ask for factory update mode:

1. Switch the radio **OFF**.
2. Hold **PTT + SK1**; SK1 is the side key immediately below PTT.
3. Turn **ON** while holding both. When the **green LED** lights, release both keys.
4. Keep the cable connected and press Enter in the PC terminal when prompted.
5. Require loader identification **BFUV32-V2**. Let erase and transfer finish
   without touching power or the cable.

No `--force` or automatic confirmation is used. This writes only the application
region starting at `0x0300C000`; the bootloader and external data flash are not
written by this update. Transfer completion is followed by an independent check.

## 5. Verify what was installed

After the flash tool finishes, switch **OFF**, remove the battery for ten
seconds, refit it with the switch **OFF**, and keep the cable connected. Run:

```powershell
& $python tools/flash-firmware.py verify-installed --backup $backup --radio-label $radioLabel --package $package --port $radioPort --execute
```

Again, wait for the reader's cue before turning **ON normally, without buttons**.
The screen remains blank. The check reads both memories and requires the complete
prepared application, original bootloader and factory calibration to match. It
prints `VERIFIED` and retains `verification.json` with the readback in your backup
folder. It does not require ordinary settings to remain identical after a normal boot.

When the reader finishes and closes, switch off, remove/refit the battery if
needed, then turn on normally with PTT released. The firmware home screen should
appear. Keep the prepared package and verification result with your backup.

## 6. Configure and try the beta

Use the grouped radio menu or the included [browser CPS](docs/CPS.md) to set your
own channel, mode, radio ID and talkgroup. Do not assume a stock codeplug has been
imported. Confirm frequency and TX settings before using PTT; normal operating
mode does not require PC arming. Test inhibition and diagnostics are menu choices.

The programming plug can redirect/mute the internal microphone or speaker.
Disconnect the **radio-side plug** for normal audio tests after closing the PC's
serial session. On first use, confirm reception before a short authorized
transmission to a known receiver. For an issue, record the beta version, mode,
frequency, DMR CC/slot/TG or P25 NAC/TG, and the observed behavior.

If boot or installation fails, follow [RECOVERY.md](RECOVERY.md). Do not flash
`program.bin` as an application or write another radio's calibration.
