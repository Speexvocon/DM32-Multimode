"""Merge this radio's own qualified native codec with a released beta, offline."""
import argparse
from pathlib import Path
import sys

from beta_tools import DEFAULT_RELEASE, prepare


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--radio-label", required=True)
    parser.add_argument("--release", type=Path, default=DEFAULT_RELEASE)
    parser.add_argument("--output", type=Path, help="New private directory under build/; never overwritten")
    args = parser.parse_args()
    package = prepare(args.backup, args.radio_label, args.release, args.output)
    print("Prepared and checked offline: " + str(package))
    print("No radio accessed. Keep this package and your backup private.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as error:
        print("prepare-firmware: " + str(error), file=sys.stderr)
        sys.exit(1)
