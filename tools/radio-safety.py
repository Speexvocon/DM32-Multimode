"""Backup, inspect, and recover your own DM32. Defaults to an offline plan."""
import subprocess
import sys

from radio_safety import main

if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print("radio-safety: " + str(error), file=sys.stderr)
        sys.exit(1)
