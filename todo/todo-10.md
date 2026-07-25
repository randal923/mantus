# Todo 10 — Chat and channels

Local chat shipped end-to-end: bounded zod intents for say/whisper/yell/private message, session-derived speaker identity, server-enforced flood limits with escalating mutes, floor-aware mode-specific routing, inert text rendering everywhere, and an accessible tabbed client panel (see [done.md](done.md)). What remains is everything beyond those four modes — channels, ignore lists, talkactions, GM/broadcast speech — plus observability and moderation metadata around the rate limiter.

## Remaining features

- [ ] **Feature 35 — Channels, ignore lists, talkactions, and speech modes** — public channels with per-line membership, ignore lists, typed player talkactions and the parity inventory shipped 2026-07-25 ([log](completed/implementation-feature-35-completed.md)); admin talkactions, GM/broadcast modes, moderation channels and ignore-list persistence remain. See [implementation](implementation-feature-35.md).
- [x] **Feature 36 — Chat observability and moderation metadata** — Flood metrics, configurable buffer limits, escalation decay, and a documented moderation retention policy. Shipped 2026-07-25; see [completed log](completed/implementation-feature-36-completed.md).

[Back to overview](README.md)
