# Source and build provenance

Latest private beta **0.2.0-beta.2** uses development source revision
`32f973f77e3b898c8e7bb7b6e3bb9fa64d865a25`. The firmware checksum in the
release manifest identifies the tested build. A repository name or version
label alone does not establish that a different binary is the same build.

## Included source

The archives in [source/](source/) contain selected Git-blob snapshots from the
commits below. The new project archive preserves exact original production
source blobs; historical archives were derived with `git archive` and are retained
byte for byte. They contain source snapshots without Git history. The project
archive replaces personal identifiers in tests and an optional export example
with neutral values, and regenerates the affected test vectors. Production
firmware sources and the tested application binary are unchanged. The two
upstream dependency archives retain their original content.

| Archive | Revision | Contents |
| --- | --- | --- |
| `0.2.0-beta.2-project.zip` | `32f973f77e3b898c8e7bb7b6e3bb9fa64d865a25` | Current V4 source with shared P25/DMR PCM-output correction and host regressions; build/generation scripts, synthetic fixtures, compatible CPS and upstream reference snippets |
| `0.2.0-beta.1-project.zip` | `2e0f18ad2d47a20b78d00c0702fbe2307dddfd09` | Earlier expanded-codeplug source retained unchanged |
| `0.1.0-beta.1-project.zip` | `05c496514bf9efe9bbb1a8f219b284228c814a60` | Earlier beta source retained unchanged for its original application |
| `radiofoundry-75c46ea-source.zip` | `75c46ea46d5ebf6406f5b4ce0bbe2443b7649f91` | Complete tracked RadioFoundry source snapshot, including HAL, board configuration, linker/startup files, native DMR stack, packing tools and codec relocation maps |
| `freertos-3a22924-source.zip` | `3a22924e0a9ddbbc8b0758881c33b3422a5cc20d` | The FreeRTOS Kernel submodule used by that RadioFoundry revision |

[source/SHA256SUMS](source/SHA256SUMS) identifies the archives.
[source/SOURCE_MANIFEST.json](source/SOURCE_MANIFEST.json) records their Git
revisions, original tree identifiers, selected file paths and individual file
checksums. Git's archive export can apply text line-ending attributes; the
manifest records the original blob ID and any such conversion for each file.
Privacy changes are explicitly listed with the original blob ID, distributed
blob ID and new checksum; personal values and a reversible redaction patch are
not included. All other files must match their recorded Git blobs, allowing
only text line-ending conversion. The project archive is a curated selection
from its recorded tree; it does not contain every file in that development
tree. The public upstream archives include their complete tracked files, but
Git does not expand submodules into `git archive`; FreeRTOS is therefore
provided separately.

The IMBE source snapshot is included under
`research/references/nostar/imbe_vocoder/`, pinned to
`03423cb00b8e9ba1be164493e8b98b5bd7c1508c`. The retained OP25 and MMDVM source
snippets used to regenerate synthetic P25 fixtures are included with their
original notices. Their pins are in `research/references/UPSTREAMS.json`.

The project ZIP excludes development analysis, private captures and backups,
stock firmware images, extracted native codec binaries, merged owner firmware,
Git history and RAM-probe research. Included `.bin` files under `fixtures/`
are synthetic tone/protocol test vectors; they are not flashable firmware.
Some retained test helpers refer to optional local development inputs. This
source bundle does not supply those inputs or promise every historical lab
test can be run from the bundle.

The current CPS runtime in both the source archive and [cps/](cps/README.md)
is unchanged from `2e0f18a` and works with beta.1 and beta.2. The [hosted CPS](https://speexvocon.github.io/DM32-Studio/)
was published as `25453260847760b543410181287c5bff03c229b1` from that same runtime.
The standalone beta copy omits the actual-C bridge test that requires the full
project host adapter; its model, expanded-codeplug and transport suites remain.
See its upstream notes for these packaging-only differences.

Host CI `43106099351` and target CI `43106099505` passed for exact latest
revision `32f973f`. Its application is 302,868 bytes (+12 from beta.1); linked
static RAM remains 162,632 of 211,456 bytes, leaving 48,824 bytes. Installation
and independent readback passed on the development radio, preserving bootloader,
native codec, calibration and settings. One ordinary P25 LISTENING-to-DMR
transition without restart played the full controlled hotspot tone with all 252
voice frames and no queue/input faults. This used NRF/fanti 049; P25 scan was not
running. The test began with the retained four-channel configuration and included
normal menu saves; no full-capacity exercise was performed. Host regressions cover
the scan transition. This is not full-capacity, multi-variant or endurance RF
qualification. The release manifest declares
four exact native codec contracts (Standard 046, Standard 049, NRF/fanti 049 and
HR Vocoder 046) for offline local preparation. Native codec bytes are excluded.
The prior 0.2.0-beta.1 and 0.1.0-beta.1 applications, archives and manifests remain unchanged.

## Inspect without building

Python can inspect or extract the ZIPs without Git:

```powershell
python -m zipfile -l .\source\0.2.0-beta.2-project.zip
python -m zipfile -e .\source\0.2.0-beta.2-project.zip .\work\project
python -m zipfile -e .\source\radiofoundry-75c46ea-source.zip .\work\radiofoundry
python -m zipfile -e .\source\freertos-3a22924-source.zip .\work\freertos
```

Extraction alone does not satisfy the original build scripts' checks: those
scripts deliberately read Git identities and require the exact RadioFoundry
checkout. Do not fabricate an upstream revision or disable its revision check.

## Developer build on Linux

These are development instructions, not a prerequisite for flashing the tested
beta. Ubuntu 24.04 is the CI reference environment. Building the C-SKY toolchain
can take substantial time and disk space. Keep generated firmware and local
codec output outside version control.

1. Extract the project ZIP into a new working directory. Initialize a local Git
   repository there and make a local snapshot commit so the original build can
   stamp a real build identity. Use your normal Git identity. This produces a
   **new** commit ID; it does not recreate development commit `32f973f`.

   ```sh
   python3 -m zipfile -e /path/to/0.2.0-beta.2-project.zip /path/to/work/project
   cd /path/to/work/project
   git init
   git add .
   git commit -m "Import 0.2.0-beta.2 corresponding source snapshot"
   ```

2. Fetch the public RadioFoundry checkout and its pinned FreeRTOS submodule.
   This online checkout route preserves the original scripts' Git-based checks.
   The included upstream ZIPs provide the same source for independent inspection;
   they are not substitutes for Git metadata in these commands.

   ```sh
   mkdir -p external/RadioFoundry
   git clone https://github.com/RadioFoundry/RadioFoundry.git external/RadioFoundry/RadioFoundry
   git -C external/RadioFoundry/RadioFoundry checkout --detach 75c46ea46d5ebf6406f5b4ce0bbe2443b7649f91
   git -C external/RadioFoundry/RadioFoundry submodule update --init third_party/FreeRTOS-Kernel
   git -C external/RadioFoundry/RadioFoundry/third_party/FreeRTOS-Kernel rev-parse HEAD
   ```

   The final line must report
   `3a22924e0a9ddbbc8b0758881c33b3422a5cc20d`.

3. Install build dependencies and build the pinned compiler/runtime sources.
   The upstream toolchain script checks source archive hashes for Binutils
   2.43.1, GCC 14.2.0 and Newlib 4.5.0.20241231. The project script adds GCC's
   C++ front end. Compiler executables and full toolchain source tarballs are
   not included in the beta repository.

   ```sh
   sudo apt-get update
   sudo apt-get install -y git curl python3 build-essential libgmp-dev libmpfr-dev libmpc-dev libisl-dev texinfo bison flex
   CLEAN=1 bash external/RadioFoundry/RadioFoundry/tools/build-csky-toolchain.sh
   bash scripts/build-csky-cxx.sh
   bash scripts/build-dm32.sh
   ```

4. The unified application is
   `build/firmware/live/imbe-bench-dm32.bin`. Its ELF, map, analysis, source
   identifiers and compiler records are in the same build directory or its
   parent. This application intentionally contains no proprietary native AMBE
   slot. Follow the beta's local codec packaging and flashing instructions
   before using an updater.

This procedure builds the supplied source, but the locally created project
commit changes its embedded build identity. Toolchain/environment differences
may also change bytes. **A byte-identical reproduction of the distributed
firmware is not promised by this archive build procedure.** Do not replace the
release checksum with a locally built binary's checksum and describe it as the
tested release.

For selected host regressions, use Python with a host C/C++ compiler:

```sh
python3 tests/test_radio_dmr.py
python3 tests/test_dmr_tx_pacing.py
python3 tests/test_drained_audio.py
python3 tests/test_drained_dmr.py
```

These tests exercise simulated hardware and do not open a serial port or
transmit RF. Broader CI scripts may require PowerShell, Node.js or additional
reference checkouts. The retained historical workflow is source evidence, not
an automatically enabled workflow in this beta repository.

## License boundaries

See [THIRD_PARTY.md](THIRD_PARTY.md) and [licenses/](licenses/). Original source
headers and upstream license files remain in the archives. The development tree
does not have a blanket project license, and this packaging document does not
assign one to every file. Explicit SPDX/file notices retain their stated terms.

The native AMBE codec is proprietary and is excluded. Its user-local extraction
and packaging tools do not grant a license to distribute stock firmware, native
codec bytes, another radio's backup or calibration data.
