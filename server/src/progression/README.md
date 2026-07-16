# Progression rules

Progression definition version 1 is a project-native, typed conversion of the
pinned Canary vocation data recorded in `content/source-manifest.json`.
Canary XML and C++ are reference inputs only and are never runtime dependencies.

Characters select a vocation at level 1, so vocation health, mana, and capacity
gains apply from the first level-up. Max health, max mana, capacity, and speed
are derived from the character's definition version, vocation, level,
equipment modifiers, and condition modifiers. Only current health, mana, and
soul are persisted. Stamina is intentionally absent until a mechanic consumes
it.

Regeneration and scheduled training run only while the character is online.
Each server tick processes at most five overdue schedule intervals and drops
additional catch-up work, so reconnects and long process stalls cannot create
offline progress.

Every retriable experience, skill, or magic award has a server-authored event
ID. The runtime rejects repeats immediately, and the event is inserted in the
same transaction as the versioned character snapshot.

Balance changes must add a new definition version and keep the older version
available until an explicit migration moves characters to it. Editing version
1 in place would silently rewrite derived stats and is not allowed.

Other players receive no exact progression fields. Exact experience, skill,
magic, health, mana, capacity, and soul values are projected only to the owning
session.
