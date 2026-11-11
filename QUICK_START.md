# Quick start

Install using [FLASHING.md](FLASHING.md) first. This guide covers **v0.2.0-beta.2 / build 32f973f**. Older firmware has fewer settings/memory slots.

## First use and controls

Turn on normally with PTT released. If held at startup, release it and wait for **PTT READY** before making a new press. Confirm mode, RX/TX frequencies, digital identity and TX permission. Wait for **SAVED** after an edit before powering off.

Remove the radio-side programming plug for normal mic/speaker use. Connect it for CPS transfers and disconnect CPS before another program uses that port.

| Control | Default action |
| --- | --- |
| OK | Open Radio menu; select an item; save a valid edit |
| Up / Down | Navigate; on home tune Frequency mode by 12.5 kHz or select a populated channel |
| Channel rotary encoder | Select populated channels in Channel mode |
| Back | Return one level or cancel |
| P1 | Switch Frequency / Channel mode |
| P2 | Radio status |
| SK1 | FM broadcast |
| SK2 | Switch A/B context |
| # or home-screen digits | Begin frequency entry |
| Hold OK + * for one second | Lock/unlock; release both before repeating |

Reassign buttons in **Settings → Button actions** or CPS **Functions**. The volume knob sets speaker level. Keypad lock leaves PTT operational and clears at restart. A key that wakes a dark display is consumed; press again to use it. PTT wakes and operates normally.

Menus/editors pause reception and do not accept PTT. Return home for calls. The TX timeout defaults to 30 seconds; release PTT after timeout before another call.

## Five menu groups

| Group | Contents |
| --- | --- |
| Operating | Frequency / Channel, A/B, save/select channel, scan lists, selected zone |
| Channel | RX/TX frequencies, simplex, mode, NAC/CC, FM/DMR settings, receive-only/filter |
| Audio & TX | Voice & ID, mic gain, TX permission, channel power and timeout |
| Settings | Display/keypad timers and button assignments |
| Tools | FM broadcast, broadcast frequency and Diagnostics/status |

Under **Channel**, enter seven digits in 100-Hz units: `1465200` means 146.520 MHz. OK saves; Back cancels; * deletes. **Use simplex** copies RX to TX. **Receive only** blocks that channel's PTT; **Audio & TX → Transmit → Transmit permission** is the separate overall permission.

| Mode | Main settings |
| --- | --- |
| P25 | NAC under Channel; TX TG/Radio ID under Audio & TX → Voice & ID |
| DMR | CC, slot, group/private and direct/repeater under Channel → DMR settings; destination/Radio ID under Voice & ID |
| FM | Width, squelch and RX/TX tones under Channel → FM settings |

NAC is hexadecimal: type digits, using Up/Down to cycle the last digit through 0-F. TGs/IDs are decimal. CTCSS radio entry is tenths of Hz (`885` = 88.5 Hz); DCS uses octal. Zero disables the tone. Digital mic gain is shared by P25/DMR; FM uses native gain.

**Audio & TX → Transmit** offers calibrated hardware power levels and a **15-600-second timeout**. Named levels are not measured watts; verify actual output with suitable equipment if needed.

## Reception and filters

P25: NAC/all TGs, PROM, or NAC+selected TG. DMR: CC/all destinations, PROM, or CC+selected destination. DMR always uses its selected slot. PROM receives compatible clear calls regardless of configured NAC/CC/TG; encrypted/unsupported calls remain muted.

Green SYNC and the RX panel indicate reception. RX identities differ from the configured TX target. Signal bars are approximate strength, not BER/a calibrated S-meter; battery fill is approximate pack level, not runtime. Reception wakes the display.

## Channels, zones and A/B

Configure a profile, then **Operating → Save channel**, choosing 001-256. Use **Select channel**, P1 or the encoder to recall memories. CPS supplies names up to 12 printable ASCII characters and **16 named zones**. Choose **Operating → Selected zone**; **All channels** is always available. Encoder/Up/Down visit populated members of that zone.

A/B retain independent selections/zones but share one receiver; no simultaneous monitoring.

## Channel scan versus P25 TG scan

Define lists in [CPS](docs/CPS.md), then **Operating → Scan lists** to select/start/stop. Home says **CH SCAN** or **TG SCAN**.

- **Channel scan** visits saved FM/DMR/P25 configurations. Compatible co-channel P25 entries share continuous acquisition.
- **P25 TG scan** stays on one P25 base memory's frequency/NAC and accepts up to **64 TGs**, without duplicate memories. Its list is strict even if the base normally uses PROM.

Each of 16 lists has a name, dwell of 100-5000 ms, post-call hold of 0-10000 ms and reply policy:

| Reply | PTT uses |
| --- | --- |
| Selected | Original selected channel; base channel for TG scan |
| Last heard | Heard channel/TG; TG override is temporary, never saved over its channel |
| Fixed | Complete reply-channel profile selected in CPS |

PTT stops scanning before replying, subject to normal TX guards. Failed profile loading refuses TX. Empty lists save but cannot start. New geometry/scan behavior still needs beta feedback; no priority scan/nuisance delete.

For TG1/10/100/1000 on one frequency/NAC, keep one P25 base memory, create a P25 TG list in CPS, enter those four TGs, choose reply behavior, review/write, then select/start it on the radio.

## Broadcast FM, lights and diagnostics

**Tools → Broadcast FM** opens a receive-only 65-108-MHz tuner and pauses the two-way channel. **P1 seeks down, P2 seeks up**; Up/Down step manually. Type the frequency (# for decimal point), then **OK** to accept; Back cancels an entry or exits. PTT exits broadcast and requires a fresh press to transmit; broadcast-band TX is never enabled.

**Settings → Display & keys** sets screen/keypad timers independently, 0-600 seconds; zero means always on. A dark display does not stop reception.

The small **D** icon identifies diagnostics/nonstandard operation. Normal releases retain status/fault info and omit extended lab capture. Use P2 or **Tools → Diagnostics → Radio status** for build/battery/counters in reports.
