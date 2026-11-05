# Browser CPS

The included browser editor programs this custom firmware's memories and settings. It is separate from firmware flashing and recovery. It does not use stock CPS, CHIRP or RadioFoundry binary codeplugs.

## Open locally

Install Python 3 if needed. From this repository's root, run:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory cps
```

Open **http://127.0.0.1:8000/** in Chrome or Edge. Keep the terminal open while using the editor. The files are served locally, and Web Serial connects directly to the selected programming cable. No remote upload service or JavaScript CDN is required. Offline editing of a sample or saved JSON is available without a radio.

## Read, edit and write

1. Turn on the installed application normally, release PTT and connect the programming cable. Close other programs using its serial port.
2. Click **Connect**, then select your cable's port. Port numbers vary between computers; there is no required COM number.
3. Click **Read radio** and save the resulting configuration file before editing.
4. Edit the working copy. To apply an offline file, first read the connected radio, then open that file. A file's origin metadata alone cannot qualify a write.
5. Resolve items under **Problems**. Choose **Review & write**, inspect the proposed changes and explicitly start the transfer.
6. Read the radio again, check the result and confirm important settings survive a normal restart.

Editing forms, loading a sample, importing a file and clicking Connect do not write settings. The firmware stages and validates the complete configuration before publishing it. Reception and PTT pause during programming.

If a write fails or its commit reply is lost, the result may be uncertain. Disconnect, reconnect and **read again** before another write; do not blindly repeat a commit. A stale revision is refused. An idle read session expires after three seconds and abandoned staging expires after 60 seconds.

## Available fields

| Area | Settings |
| --- | --- |
| Memories / A/B | 32 named memories, two VFO contexts, independent RX/TX frequencies and receive-only |
| P25 | NAC, transmit talkgroup, PROM/NAC/NAC+TG receive policy |
| DMR | Color code, timeslot, 24-bit destination, group/private, direct/repeater and receive policy |
| FM | Narrow/wide, squelch, independent TX/RX CTCSS or normal/inverse DCS |
| Global | Digital radio ID, digital mic gain, active selections, transmit permission, scan list and screen/keypad timeouts |
| Scan | Four overlapping membership lists |

Digital mic gain applies to both P25 and DMR; FM uses its native microphone gain. A/B share one receiver. PROM does not decode encryption, and DMR PROM still uses the selected timeslot.

Names allow 12 printable ASCII characters. Enter frequencies in MHz, NAC in hexadecimal, CTCSS in Hz and DCS in octal. Use your own radio ID and channel values; the sample is an editing example, not a ready-to-transmit configuration.

The `.json` file is a versioned `DM32P25-CPS` envelope containing all 35 logical records, CRC and origin metadata. Keep it with your backups. Unknown future versions are rejected; version-1 P25/FM files can be imported. The CPS cannot address the bootloader, program flash, factory calibration or arbitrary radio storage.

## Current validation limit

The editor, transport and atomic storage have host tests against the actual firmware parser. Its first end-to-end physical browser programming session remains a beta check; do not infer that it passed from a simulated serial test. The [tester guide](../TESTING.md) explains useful read/write/readback feedback.
