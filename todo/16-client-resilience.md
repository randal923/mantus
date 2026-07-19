# Client and session resilience

Build this continuously as authoritative features land. Reconnect and resync
must restore server truth without replaying stale intents or duplicating state.

Split into one-session units:

1. [Session resync and reconnect](16a-session-resync-and-reconnect.md)
2. [Client state boundaries and resource bounds](16b-client-state-boundaries.md)
3. [Client error handling and diagnostics](16c-client-error-handling.md)

[Back to overview](README.md)
