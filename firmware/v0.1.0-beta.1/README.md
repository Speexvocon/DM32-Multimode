# 0.1.0-beta.1 — firmware 05c4965

This is the exact application tested on the development DM-32UV. The package
version names this beta distribution; the radio reports build `05c4965`.

**Do not flash the `.application.bin` file directly.** It deliberately omits the
native DMR codec. Build the complete update locally from your own sealed backup,
following [FLASHING.md](../../FLASHING.md). The updater erases the codec region.

`release.json` records the application checksum and exact source revision.
[Release notes](../../RELEASE_NOTES.md) distinguish tested behavior from beta limits.
