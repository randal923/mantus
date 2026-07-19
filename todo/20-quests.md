# Quests

The last feature in the backlog, implemented after every other system.
Deliberately scheduled last: quest content is the largest pure-content layer
in the pinned baseline (114 quest script directories, 624 of them
storage-driven) and it only consumes the platform beneath it — character
storage, [`world actions`](12-world-actions.md), NPC dialogue, spawns.
Nothing else in the backlog depends on quest content.

Pinned parity includes every registered quest, mission, storage transition,
quest-log line, reward, and quest-scripted world interaction. Formerly the
world-interaction units lived in this feature; they now ship earlier as
[`12-world-actions`](12-world-actions.md) and
[`13-raids-and-world-events`](13-raids-and-world-events.md), with their
storage-gated quest variants deferred back here.

Implement in order:

1. [Quest state and storage](20a-quest-state.md) — definitions, persistent
   character storage write path, quest log, atomic rewards.
2. Full quest-content inventory — every pinned quest/mission definition,
   prerequisite, transition, and reward; the storage-gated world actions
   deferred from [`12-world-actions`](12-world-actions.md) (quest doors,
   one-time storage-keyed chests, storage-gated teleports/tiles); and the
   quest-gated NPC dialogue branches deferred from
   [`10b-npc-dialogue-and-travel`](10b-npc-dialogue-and-travel.md).

[Back to overview](README.md)
