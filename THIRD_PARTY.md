# Third-party source and notices

This beta combines source with different notices. The repository's private
visibility does not replace those notices. The archives preserve original
headers; the license text copies below are supplied for convenience.

| Component | Revision / source | Applicable notices |
| --- | --- | --- |
| Project unified P25/DMR/FM firmware and browser CPS | Development source `05c496514bf9efe9bbb1a8f219b284228c814a60`; corresponding project ZIP in `source/` | Many firmware, generator and CPS files explicitly declare `GPL-3.0-or-later`. Follow each file's notice; the original tree has no blanket project license. [GPLv3](licenses/GPL-3.0.txt) |
| Fixed-point IMBE vocoder | `nostar/imbe_vocoder`, `03423cb00b8e9ba1be164493e8b98b5bd7c1508c`; included in project ZIP | GPL-3.0-or-later source notices; Pavel Yazev and other upstream copyright notices retained. [GPLv3](licenses/GPL-3.0.txt) |
| RadioFoundry HAL, drivers, native DMR call/FEC/audio stack, board/linker/startup files and tools | `RadioFoundry/RadioFoundry`, `75c46ea46d5ebf6406f5b4ce0bbe2443b7649f91`; complete tracked source ZIP | MIT, Copyright 2026 The RadioFoundry Authors; [notice](licenses/RadioFoundry-MIT.txt) |
| FreeRTOS Kernel | `3a22924e0a9ddbbc8b0758881c33b3422a5cc20d`; separate complete source ZIP | MIT; preserve the Kernel's [notice](licenses/FreeRTOS-MIT.txt) and any individual port notices in the archive |
| OP25 reference snippets and derived P25 framing/interleave/channel vectors | `boatbod/op25`, `3f44d43eb449bb4753247ce848bb42a403823dea`; retained reference snippets in project ZIP | GPL notices in source headers, including GPL-2.0-or-later material. [GPLv2](licenses/GPL-2.0.txt), [GPLv3](licenses/GPL-3.0.txt) |
| MMDVM calibration/DMR/P25 reference snippets and synthetic tone fixtures | `g4klx/MMDVM`, `046e1df16105cbc33de3da7b7d6a03af402ed81d`; retained reference snippets in project ZIP | GPL-2.0-or-later source notices. Preserve original notices and fixture provenance. [GPLv2](licenses/GPL-2.0.txt) |
| Browser editor undo/redo adaptation | Pinned RadioFoundry editor sources; see CPS upstream notes and `vendor/` | MIT; retained original notice and `LICENSE.RadioFoundry` |
| GCC support runtime | GCC 14.2.0, built by the pinned toolchain scripts | GCC licenses and the [GCC Runtime Library Exception 3.1](licenses/GCC-Runtime-Library-Exception-3.1.txt); compiler source download and hash checks are in the supplied build scripts |
| Newlib C/math runtime | Newlib `4.5.0.20241231`, built by the pinned toolchain script | Multiple retained notices, collected in [Newlib COPYING](licenses/Newlib-COPYING.txt); source archive is downloaded and hash-checked by the supplied toolchain script |

The retained source is a collection of upstream and project files, not a claim
that every file is licensed under one uniform license. The packaging does not
relicense files without a license notice. Distribution of a derived executable
must retain the applicable notices and its corresponding source/build inputs;
the release supplies these source archives alongside its codec-free application.

## Proprietary native codec and private radio data

The DM32's stock AMBE+2 codec belongs to its respective rights holders. No stock
firmware image, extracted codec executable/table bytes or owner-merged updater
is distributed here. RadioFoundry's codec maps contain addresses, relocation
metadata and fingerprints rather than codec bytes. The local packaging tool
reads the tester's own supported stock backup to construct the complete updater
on that tester's machine. Keep its output local and outside version control.

Per-radio program/data backups, factory calibration, contacts, saved settings,
private call recordings and credentials are also excluded. This repository does
not grant rights to those materials and does not provide another radio's
calibration as a substitute.

## Notice provenance

The RadioFoundry and FreeRTOS license copies were read directly from the exact
recorded Git revisions. GPL text and the GCC Runtime Library Exception were
copied from the local Git for Windows distribution's GNU/toolchain notices.
Newlib's notice was extracted
from Sourceware's pinned source tarball after matching SHA-256
`33f12605e0054965996c25c1382b3e463b0af91799001f5bb8c0630f2ec8c852`.
Original download locations and notice checksums are recorded in
[source/SOURCE_MANIFEST.json](source/SOURCE_MANIFEST.json).
