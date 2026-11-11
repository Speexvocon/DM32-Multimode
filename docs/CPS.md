# DM32 Studio browser CPS

Open **[DM32 Studio](https://speexvocon.github.io/DM32-Studio/)** in desktop Chrome or Edge. It programs this custom P25/DMR/FM firmware; it does **not flash firmware**. Stock CPS, CHIRP and RadioFoundry binary codeplugs use different formats.

V0.2.0-beta.2 uses the same CPS and V4 codeplug format as beta.1; no CPS update or codeplug conversion is needed between them. The included `cps/` runtime is unchanged from source `2e0f18a`, hosted revision `25453260847760b543410181287c5bff03c229b1`. To serve locally, run from this repository:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory cps
```

Use `py -3` instead of `python` if needed. Open **http://127.0.0.1:8000/** and leave the terminal running. Hosted HTTPS/localhost support Web Serial; opening `index.html` directly is not the recommended serial workflow. Samples/saved files work without a radio. There is no serial backend/configuration-upload service; the browser connects directly after your click.

## Read, edit and write

1. Turn on the installed application normally with PTT released, connect the cable and close other serial users.
2. Click **Connect**, selecting your cable's port. No required COM number.
3. **Read radio**, then export complete JSON **before editing**. Keep an original before firmware/codeplug upgrades.
4. Edit channels, VFOs, zones, scan lists, Radio settings or **Functions**. To use an offline file, read the radio first, then open it. File metadata alone never qualifies a write.
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
| Functions | TX permission/15-600-second timeout, button actions, broadcast FM and light timers |

Names: 12 printable ASCII characters. Enter MHz, hexadecimal NAC, Hz CTCSS and octal DCS. Digital gain applies to P25/DMR; FM uses native gain. A/B share one receiver. PROM cannot decode encryption; DMR PROM stays on its slot. Power labels are hardware levels, not measured watts. Samples are editing examples: use your own identity/channels.

**JSON is the full backup:** records, CRC, geometry and origin metadata. **CSV is channels only**, omitting zones, lists, VFOs/globals/functions. Export the supplied header before import. Bulk edit updates a selected field atomically. Move rewrites all references to follow channel identities; review dependent-list changes when clearing a channel.

## Legacy upgrade and rollback

CPS supports V1-V3's 35 records and V4's 387 records (12,384 bytes). It pins connected geometry. Legacy files stay legacy until **Upgrade codeplug** creates an expanded draft; four membership bits become Scan 1-4 with Last heard reply. V4 drafts require V4 firmware and are never silently truncated. Unknown future formats are refused.

Export the earlier beta's JSON before flashing. New firmware reads legacy settings without boot migration writes; the first explicit save publishes V4. Keep compatible older JSON for rollback: old firmware cannot use extra memories/zones/lists and its legacy fallback may be stale. See [upgrade instructions](../FLASHING.md#upgrading-an-existing-beta).

## Two scan types

**Channel scan** visits selected FM/DMR/P25 profiles; compatible co-channel P25 members keep continuous acquisition. **P25 TG scan** stays on a P25 base memory's frequency/NAC, accepting up to 64 unique nonzero TGs independently of its normal receive filter. Duplicate frequency memories are unnecessary. Encrypted/unsupported calls stay muted.

Each list has a name, **100-5000-ms dwell**, **0-10000-ms hold** and reply: **Selected** (original/base profile), **Last heard** (temporary heard channel/TG), or **Fixed** (explicit complete reply channel). Empty lists save but cannot start. Use **Operating → Scan lists** on radio; home shows CH SCAN/TG SCAN.

For TG1/10/100/1000 on one frequency/NAC, save one P25 base memory, add a P25 TG list with those IDs, choose reply behavior and review/write.

## Validation limit

Editor/transport, actual C parser, migration and atomic storage have host tests; browser tests simulate serial. Physical V4 programming/scanning remain beta feedback areas. See [TESTING.md](../TESTING.md).
