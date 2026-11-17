# Named P25 trunking systems

The V6 CPS has eight named systems with up to eight candidate control channels
each. Configure your own system name, mode, WACN/system/NAC, talkgroup and
source identity, then review/write the complete codeplug. Receive-only mode is
separate from explicitly experimental subscriber operation.

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

Search without an available control channel is expected. A software READY,
queued request or successful local response is not RF access-slot calibration.
The implementation does not claim Phase2, CQPSK, decryption, authentication,
vendor patches/regrouping or multi-site roaming. See [known issues](../KNOWN_ISSUES.md).
