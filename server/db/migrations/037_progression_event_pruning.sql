-- Bound progression_events growth. Every kill/skill/magic award appended a row
-- keyed by a globally-unique event id ("{prefix}:{runId}:{counter}" or
-- "death:{uuid}", never re-delivered across a run or restart), and nothing ever
-- pruned them, so the table (and the in-memory processedEventIds set rebuilt
-- from it on load) grew forever with playtime.
--
-- Tag each event with the character snapshot version that made it durable, so
-- the save transaction can drop rows older than a bounded window while the
-- prune and the snapshot that reflects those events commit atomically.
alter table progression_events
  add column snapshot_version integer not null default 0
    check (snapshot_version >= 0);

create index progression_events_character_snapshot_version_idx
  on progression_events(character_id, snapshot_version);
