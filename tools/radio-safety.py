"""Backup, inspect, and recover your own DM32. Defaults to an offline plan."""
import subprocess
import sys

from radio_safety import main, dependency_hint

if __name__ == "__main__":
    try:
        main()
    except ModuleNotFoundError as error:
        print("radio-safety: " + dependency_hint(error), file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print("radio-safety: " + str(error), file=sys.stderr)
        sys.exit(1)
