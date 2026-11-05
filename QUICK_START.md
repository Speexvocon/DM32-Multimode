# Quick start

Install using [FLASHING.md](FLASHING.md) first. This guide describes normal radio use on v0.1.0-beta.1; optional test modes live under Diagnostics.

## First use

Turn on normally with PTT released. If PTT was held during startup, release it and wait for **PTT READY** before making a new press. The held-PTT startup warning prevents that initial press from carrying into a transmission.

Check the active channel's mode, receive/transmit frequencies, digital identity and transmit permission. Use your own values. Wait for **SAVED** after changing settings before switching power off.

Unplug the radio-side programming cable for ordinary microphone/speaker use. On the tested programming connection, the plug affects the radio's audio routing. Keep the cable connected for CPS transfers, then disconnect the CPS before another program accesses that port.

## Controls

| Control | Action |
| --- | --- |
| OK | Open Radio menu; select an item; save a valid edit |
| Up / Down | Navigate a menu; on home, tune a VFO by 12.5 kHz or change memory |
| Back | Return one level or cancel an edit |
| P1 | Switch between VFO and populated memories |
| SK2 | Switch A/B context |
| # or home-screen digits | Start frequency entry |
| P2 | Open Radio status |
| Hold OK + * for one second | Lock/unlock the keypad; release both before repeating |

The physical volume knob controls speaker level. Keypad lock does not disable PTT and clears at restart. A key that wakes a dark display is consumed, so press again to perform its ordinary action. PTT wakes and operates normally.

Menus and editors pause normal reception and do not accept PTT. Return home before making or receiving a call. Calls have a 30-second limit; release PTT before starting another call after timeout.

## Set a channel

Open **OK → Channel**. Set **Mode**, **Receive frequency** and **Transmit frequency**, or choose **Use simplex** to copy receive frequency to transmit. **Receive only** disables transmission for that channel. The root **Transmit** item separately controls the owner's overall transmit permission.

Frequency entry uses seven digits in units of 100 Hz. For example, `1465200` means 146.520 MHz; this illustrates the entry format, not a supplied channel. OK saves; Back cancels; * deletes the last digit.

| Mode | Channel/signaling settings |
| --- | --- |
| P25 | NAC under Channel; TX talkgroup and Radio ID under Voice & ID |
| DMR | Color code plus DMR settings: timeslot, group/private call and direct/repeater operation; TX destination and Radio ID under Voice & ID |
| FM | FM settings: narrow/wide bandwidth, squelch and independent transmit/receive tones |

P25 NACs are hexadecimal. Enter numeric digits normally; Up/Down cycles the last digit through 0–F. P25 talkgroups and digital IDs are decimal. Digital mic gain is shared by P25 and DMR; analog FM uses its native gain.

FM CTCSS entry uses tenths of a hertz (`885` means 88.5 Hz); DCS entry uses octal digits. A zero tone code disables that tone. FM is implemented but its RF/audio behavior is not yet physically qualified for this beta.

## Receive filters and call information

Select **Receive filter** to cycle through the available policies:

| Mode | Policies |
| --- | --- |
| P25 | Configured NAC/all talkgroups; PROM; configured NAC plus selected talkgroup |
| DMR | Configured color code/all destinations; PROM; configured color code plus selected destination |

PROM bypasses the configured identity filters for compatible clear voice. DMR still listens on the selected timeslot. PROM does not decode encrypted traffic or add support for another air protocol; encrypted and unsupported calls remain muted.

Green SYNC and the received-call panel identify reception. Received IDs are distinct from the configured TX target. Signal bars show approximate strength, not BER or a calibrated S-meter. The battery icon indicates approximate pack level, not time remaining. Raw values and build information remain under Radio status.

## Memories, A/B and scanning

Configure the current channel, then use **Memories / VFO → Save to memory** and select slot 01–32. Use **Recall memory**, P1 or Up/Down to select populated memories. Initially unnamed slots use `CH nn`; the browser CPS can assign names up to 12 printable ASCII characters.

A/B retain independent selections, but share one RF receiver. There is no simultaneous monitoring.

Under **Scan lists**, choose one of four lists and include the current channel. Save that profile in a memory before expecting it in memory scanning. Start scanning from the same menu. PTT or a local action stops on the current channel. The implemented dwell/hold is one second/two seconds; there is no priority scan or nuisance delete. Mixed-mode scan acquisition remains unqualified.

## Screen, lights and diagnostics

**Display & keys** controls the screen and keypad-light timers separately, from 0–600 seconds; zero means always on. Reception wakes the screen. Turning the backlight off does not stop the receiver.

The small **D** icon points to Diagnostics. It becomes amber for nonstandard diagnostic paths. Leave bench/audio test choices at their normal settings for ordinary operation. Use P2 or **Diagnostics → Radio status** when reporting an issue.

For a complete configuration editor and file backup, see [browser CPS](docs/CPS.md).
