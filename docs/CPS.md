# DM32 Studio browser CPS

Open **[DM32 Studio](https://speexvocon.github.io/DM32-Studio/)** in desktop Chrome or Edge. The editor programs the logical P25/DMR/FM configuration. Its separate **Firmware** page prepares a local update from your sealed backup and offers a reviewed transfer; opening either page never writes the radio. Stock CPS, CHIRP and RadioFoundry binary codeplugs use different formats.

V0.3.0-beta.2 uses the same V6 settings format as beta.1: 499 records, 256 channels, 16 zones/lists, 96 contacts and eight named trunking systems with eight control channels each. No conversion is needed between these two releases. The current CPS preserves V1–V5 formats until an explicit working-copy upgrade and checks the connected firmware's capabilities before writing. Firmware and CPS source identities are separate in the release manifest. To serve locally, run from this repository:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory cps
```

Use `py -3` instead of `python` if needed. Open **http://127.0.0.1:8000/** and leave the terminal running. Hosted HTTPS/localhost support Web Serial; opening `index.html` directly is not the recommended serial workflow. Samples/saved files work without a radio. There is no serial backend/configuration-upload service; the browser connects directly after your click.

## Read, edit and write

1. Turn on the installed application normally with PTT released, connect the cable and close other serial users.
2. Click **Connect**, selecting your cable's port. No required COM number.
3. **Read radio**, then export complete JSON **before editing**. Keep an original before firmware/codeplug upgrades.
4. Edit channels, VFOs, zones, scan lists, contacts, named trunking systems, Radio settings or **Functions**. To use an offline file, read the radio first, then open it. File metadata alone never qualifies a write.
5. Resolve **Problems**. Select **Review & write**, inspect changes and explicitly start.
6. Read again, check values and retention after restart. Click **Disconnect** when done so flashing/diagnostic tools can use the port.

Forms, samples, imports and Connect do not write. Firmware validates/stages the whole snapshot before atomic publication. RX/PTT pause during programming; stale revisions are refused. If a commit reply is lost, reconnect and **Read radio before another write**, rather than blindly retrying. Idle reading expires after three seconds; abandoned staging after 60 seconds.

## Fields and file types

| Area | Settings |
| --- | --- |
| Channels / A-B | 256 named memories on V4 (32 legacy); RX/TX, mode, receive-only and power |
| P25 | NAC, TX TG, PROM/NAC/NAC+TG receive policy |
| DMR | CC, slot, 24-bit destination, group/private, direct/repeater and receive policy |
| FM | Width, squelch, independent RX/TX CTCSS or normal/inverse DCS |
| Radio settings | Digital ID/mic gain, A/B memories/zones and scan list |
| Zones | 16 named channel groups; All channels remains available |
| Scan lists | 16 named Channel/P25 TG lists; base, members, dwell/hold and reply |
| Contacts | 96 protocol/call-type/ID aliases on V5 and later |
| Trunking | Eight named V6 systems, mode/identity/TG and up to eight control channels per system |
| Functions | TX permission/15-600-second timeout, button actions, broadcast FM and light timers |

Names: 12 printable ASCII characters. Enter MHz, hexadecimal NAC, Hz CTCSS and octal DCS. Digital gain applies to P25/DMR; FM uses native gain. A/B share one receiver. PROM cannot decode encryption; DMR PROM stays on its slot. Power labels are hardware levels, not measured watts. Samples are editing examples: use your own identity/channels.

**JSON is the full backup:** records, CRC, geometry and origin metadata. **CSV is channels only**, omitting zones, lists, VFOs/globals/functions. Export the supplied header before import. Bulk edit updates a selected field atomically. Move rewrites all references to follow channel identities; review dependent-list changes when clearing a channel.

## Trunking: Do not affiliate

In **Trunking**, add or edit a system and leave **Do not affiliate (receive
only)** checked for listening. The radio may follow the selected talkgroup but
will not register, affiliate or transmit while that saved system is running.
Entering a radio ID does not override this setting.

New systems have the checkbox checked. Existing systems keep their saved mode,
including experimental subscriber mode; opening or updating CPS does not alter
them. Check each system's mode in **Review & write**. Clear the checkbox only
for experimental subscriber operation on a system that explicitly authorizes
your radio and testing. See [the trunking guide](TRUNKING.md).

## Legacy upgrade and rollback

CPS supports V1–V3's 35 records, V4's 387, V5's 483 and V6's 499 records. It pins connected geometry. Older files retain their original geometry until an explicit upgrade creates a new draft. Newer records are never silently truncated onto older firmware. Unknown future formats are refused.

Export the earlier beta's JSON before flashing. New firmware reads older settings without boot migration writes; an explicit settings save publishes the current format. Keep compatible older JSON for rollback: older firmware cannot use added contacts/systems and its fallback may be stale. See [upgrade instructions](../FLASHING.md#upgrading-an-existing-beta).

## Two scan types

**Channel scan** visits selected FM/DMR/P25 profiles; compatible co-channel P25 members keep continuous acquisition. **P25 TG scan** stays on a P25 base memory's frequency/NAC, accepting up to 64 unique nonzero TGs independently of its normal receive filter. Duplicate frequency memories are unnecessary. Encrypted/unsupported calls stay muted.

Each list has a name, **100-5000-ms dwell**, **0-10000-ms hold** and reply: **Selected** (original/base profile), **Last heard** (temporary heard channel/TG), or **Fixed** (explicit complete reply channel). Empty lists save but cannot start. Use **Operating → Scan lists** on radio; home shows CH SCAN/TG SCAN.

For TG1/10/100/1000 on one frequency/NAC, save one P25 base memory, add a P25 TG list with those IDs, choose reply behavior and review/write.

## Validation limit

Editor/transport, actual C parser, migration and atomic storage have host tests; browser tests simulate serial. Full-capacity V6 programming, trunking and broader physical browser operations remain beta feedback areas. See [TESTING.md](../TESTING.md).
