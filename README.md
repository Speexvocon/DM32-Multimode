# DM32 Multimode

**P25, DMR and analog FM in one firmware for the Baofeng DM-32UV.**

DM32 Multimode is an independent, experimental project for amateur radio,
education and academic research. It replaces the radio's factory software and
adds a browser-based programming tool called **DM32 Studio**.

**This is beta software. Do not rely on it for emergency, life-safety,
public-safety or other mission-critical communications.** Features may have
faults, miss calls or stop working unexpectedly. Keep a proven radio available
for communications you must be able to depend on.

## Start here

| What would you like to do? | Open this |
| --- | --- |
| Install the firmware or update an existing beta | [Installation instructions](FLASHING.md) |
| Use the browser installer | [Firmware installer](https://speexvocon.github.io/DM32-Studio/firmware.html) |
| Program channels and radio settings | [DM32 Studio CPS](https://speexvocon.github.io/DM32-Studio/) |
| Learn the buttons, menus and everyday controls | [Quick start](QUICK_START.md) |
| Check a problem or limitation | [Known issues](KNOWN_ISSUES.md) |
| Return to your original firmware | [Recovery instructions](RECOVERY.md) |

## Current release and compatible radios

| Item | Details |
| --- | --- |
| Latest beta | **v0.3.0-beta.1** |
| Build shown on the radio | **6868053** |
| Intended radio | Classic **DM-32UV / DM32** hardware with a supported original codec |
| Currently incompatible | **RF-B / DM32.NRFB.01.050** variants; support is planned |

Do not assume every radio sold as a DM32 has the same hardware. The installation
tools check model identification and the original backup's codec; those checks
do not qualify every hardware revision. If an unsupported radio or codec is
reported, stop and ask for help rather than forcing the installation.

The **codec** is the radio's digital voice software. It is not distributed in
this repository. The installer uses the correct copy from **your own original
backup of that same physical radio** to prepare the update locally. Never use
another radio's backup or calibration files.

See the [release notes](RELEASE_NOTES.md) for changes and testing details.
Older releases remain available in [the firmware folder](firmware/).

## Your first installation, in plain language

1. **Check compatibility and read the instructions.** Have a charged battery,
   the correct USB programming cable and a reliable USB connection. The
   [installation guide](FLASHING.md) explains both browser and command-line routes.
2. **Keep your original backup safe.** First-time installation needs an original
   backup. If you already have a verified, sealed backup for this radio, reuse it.
   Keep a second copy somewhere safe; it is your route back to the original firmware.
3. **Save your settings before updating.** If you already run this beta, use
   DM32 Studio to read the radio and export the complete **JSON** file. A channel
   CSV file is not a complete backup. Keep older JSON files for returning to an
   earlier version. Our CPS does not read the factory firmware's settings.
4. **Follow the installer prompts.** Do not flash the bare application file by
   itself. The preparation step combines it with your radio's own codec.
   Opening the CPS does not automatically install firmware.
5. **Program your own channels and radio ID.** The supplied defaults are examples,
   not a ready-to-transmit setup. Check frequencies, mode, power, receive filters
   and transmit permission before making a call. Stock codeplugs are not imported
   automatically.
6. **Disconnect the programming cable for normal audio.** Close the serial
   connection and remove the plug from the radio. That plug changes the internal
   microphone and speaker routing. Start by listening to a known signal, then
   make a short, authorized test call.

The [quick start](QUICK_START.md) explains normal operation after installation.
The [CPS guide](docs/CPS.md) explains programming and saving your settings.

## What the beta offers

| Feature | What it does |
| --- | --- |
| P25 Phase 1, DMR and analog FM | Use conventional digital or analog channels in the same firmware |
| 256 channel memories | Store named channels and organize them into 16 zones |
| Channel and talkgroup scanning | Use 16 scan lists; P25 talkgroup lists can monitor up to 64 groups on one frequency |
| Contacts and call information | Store 96 contacts and show names and received-call details |
| Messaging | Send and receive supported P25/DMR text messages; see [messaging details and limits](cps/README.md#text-messaging) |
| P25 trunking | Store eight named systems with up to eight control-channel frequencies each; see the limits below |
| Installable applets | Load small, bounded programs such as Counter and SAME Watch; see the [applet guide](docs/APPLETS.md) |
| Everyday controls | Frequency/channel modes, keypad lock, display timers, microphone gain, channel power and an adjustable transmit timeout |

The two A/B selections share **one receiver**. They do not receive two channels
at the same time. Power labels, battery icons and signal bars are approximate;
they are not calibrated test instruments.

## P25 trunking: experimental

Trunking follows a system's control channel to find an assigned voice channel.
This beta supports **clear P25 Phase 1 C4FM group calls**. It offers separate
**receive-only** and **experimental subscriber** modes.

Subscriber mode can send registration, affiliation and channel requests. Use it
only on a system whose operator has explicitly authorized your radio and testing.
It is not a way to gain access to someone else's network.

Local tests have demonstrated registration, affiliation, granted voice calls and
incoming call following. Precise radio-frequency access-slot timing and operation
on arbitrary production systems have **not** been qualified. Phase 2, CQPSK,
multi-site roaming and encrypted voice are not supported. Encrypted calls remain
muted; this project does not provide decryption.

Read the [trunking guide](docs/TRUNKING.md) and [known issues](KNOWN_ISSUES.md)
before enabling it. Messaging, scanning, applets and hardware variants also need
broader beta feedback. SAME Watch is experimental and must not be relied on for
weather warnings or emergency alerts.

## Responsible use and disclaimer

This project is provided for **experimental, educational, academic and amateur
radio use**. It is independent community work, not factory firmware or a
manufacturer-approved product.

You are responsible for your equipment, backups, configuration and operation.
Transmit only where your license and applicable rules allow, and use repeaters
or networks only with the required authorization. A frequency being selectable,
a signal being receivable, or a feature being present does not grant permission
to transmit, register or affiliate. Do not use this project for interference,
impersonation, unauthorized system access or other unlawful activity.

**Use at your own risk.** Firmware changes can cause lost settings, unreliable
operation or a radio that needs recovery. The software and documentation are
provided **"as is," without warranty**, including any warranty of fitness for a
particular purpose. To the extent permitted by applicable law, the maintainers
and contributors accept no responsibility or liability for equipment damage,
data loss, interference, unlawful use, injury or other loss arising from use or
misuse of this project. You remain responsible for how you use it.

These notices do not replace or change the applicable software licenses. See
[source and build information](SOURCE.md), [third-party notices](THIRD_PARTY.md)
and [included licenses](licenses/).

## Help and beta feedback

Found a problem? Check [known issues](KNOWN_ISSUES.md), then follow the
[feedback guide](TESTING.md) or [open a bug report](https://github.com/Speexvocon/DM32-Multimode/issues/new?template=bug_report.yml).
Include the firmware build, radio mode, what you expected and what happened.
One clear description is useful; repeated testing is not required.

## Thanks and acknowledgments

Thank you to the authors, maintainers and contributors of the projects that made
this work possible:

- [RadioFoundry](https://github.com/RadioFoundry/RadioFoundry) — hardware support,
  drivers, the native DMR stack, firmware tools and browser programming/flashing
  code and design.
- [IMBE Vocoder](https://github.com/nostar/imbe_vocoder) — the fixed-point IMBE
  voice codec used for P25, including the work of Pavel Yazev and other upstream
  contributors.
- [FreeRTOS Kernel](https://github.com/FreeRTOS/FreeRTOS-Kernel) — the embedded
  operating-system kernel.
- [OP25](https://github.com/boatbod/op25) — P25 framing and protocol references
  and the basis for derived test vectors.
- [MMDVM](https://github.com/g4klx/MMDVM) — DMR/P25 reference code and synthetic
  test fixtures, along with the wider MMDVM community's radio-testing tools.
- [GCC](https://gcc.gnu.org/), [GNU Binutils](https://www.gnu.org/software/binutils/)
  and [Newlib](https://sourceware.org/newlib/) — the compiler, build tools and
  runtime libraries.

For protocol research and laboratory testing, thanks also to:

- [SiteSim](https://github.com/SarahRoseLives/SiteSim) — the trunking lab
  controller and system-testing reference.
- [MMDVM_HS](https://github.com/juribeparada/MMDVM_HS) and
  [MMDVMHost](https://github.com/g4klx/MMDVMHost) — hotspot platforms, protocol
  references and independent decoding/diagnostic tools.
- [QuantarBridge](https://github.com/pieschel/quantarbridge) — a P25 messaging
  protocol and interoperability reference.

Thanks also to the beta testers and fellow hams who have shared observations,
reported bugs and helped improve the radio.

Original credits and license notices remain with their respective code. See
[third-party notices](THIRD_PARTY.md) and [source information](SOURCE.md) for the
included components and their exact revisions.
