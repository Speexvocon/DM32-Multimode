# Named P25 trunking systems

The V6 CPS has eight named systems with up to eight candidate control channels
each. Configure your own system name, mode, WACN/system/NAC, talkgroup and
source identity, then review/write the complete codeplug. Firmware
**v0.3.0-beta.2 / e799c73** keeps the same V6 settings format as beta.1.

## Listening without affiliation

Leave **Do not affiliate (receive only)** checked in the CPS system editor for
passive listening. The radio searches the saved control frequencies, checks the
configured system/site identity, and follows matching clear group calls. It
does not register, affiliate or transmit on that saved system, even if a radio
ID is entered or PTT is pressed.

Newly added systems default to this setting. Existing systems retain their
saved mode; opening the updated CPS does not change an experimental subscriber
system to receive-only. Check the setting before **Review & write**.

Clear the checkbox only for explicitly authorized experimental subscriber
operation. Receive-only applies while the saved trunking system is running;
stopping it returns to the separate conventional channel and its permissions.

## Starting and using a system

On the radio open **Operating → P25 trunking**. Choose **Selected system**,
then **Start selected system**. **Talkgroup** changes its selected group;
**Start at power on** retains the startup choice. **Receive current channel**
is a separate temporary passive follower and does not start a saved subscriber
system. **Stop trunking** ends it when desired.

The radio qualifies control identity and channel identifiers before following a
matching clear Phase1 C4FM grant. It temporarily tunes the voice downlink and
returns after termination/loss/timeout. Saved conventional frequencies remain
separate. Experimental PTT requires the registered/affiliated selected system,
an accepted group grant and existing TX/context/deadline guards. Wait for the
accepted-grant cue before speaking; release PTT normally to end the call.

## Search and receive recovery

The radio can now read additional Phase 1 control-channel announcements,
including FDMA channel identifiers carried in opcode `0x33` and supported AMBT
site, network and group-grant messages. This does not add Phase 2 voice support.

An empty candidate is skipped promptly. A candidate with real P25 evidence gets
a bounded chance to supply the required identity and channel map. Once locked,
validated control traffic can keep reception active while fresh site/network
identity is still available. Moving to another candidate clears the old map
and decoder state; a grant from an old frequency cannot establish a new lock.

A saved receive-only system can recover a temporary recorder/input failure.
It pauses, retries the same candidate a limited number of times, then moves on
after a longer delay if tuning still fails. Every restart needs fresh control
information. Stopping the system, entering programming or changing the saved
system cancels that recovery. Experimental subscriber failures retain their
separate handling.

These changes passed simulated controller tests and the processor build.
Their behavior on real sites remains unqualified; please report the build,
system settings and what the radio displayed if it cannot hold a control lock.

Search without an available control channel is expected. A software READY,
queued request or successful local response is not RF access-slot calibration.
The implementation does not claim Phase2, CQPSK, decryption, authentication,
vendor patches/regrouping or multi-site roaming. See [known issues](../KNOWN_ISSUES.md).
