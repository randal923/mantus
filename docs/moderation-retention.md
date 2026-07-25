# Moderation data retention

Moderation metadata is kept separately from gameplay chat and is never mixed
into gameplay payloads. This document is the policy the server actually
enforces; the prune that implements it runs from `ModerationService.tick`
(`pruneRetention` in `ModerationStore`).

## What is stored

| Data | Table | Contains |
| --- | --- | --- |
| Action trail | `moderation_actions` | action kind, target, issuing GM, reason, duration, timestamps |
| Active mutes | `character_mutes` | character, expiry, reason |
| Account bans | `account_bans` | account, expiry, reason, issuing GM |
| Player reports | `player_reports` | reporter, target, category, free-text comment, status |

**Chat bodies are never stored.** A report's `comment` is text the reporter
chose to submit about an incident, not a captured transcript; nothing in the
chat path writes what a player said to disk or to a log. Flood control emits
counters and one metadata line per mute (character id, escalation level,
duration) and nothing else — see `ChatFloodMetrics`.

## Retention period

`moderation.retentionDays` in `config.yml`, default **365 days**.

A row is eligible for pruning when it is older than the cutoff **and** no
longer enforcing anything:

- `character_mutes` — only rows whose `muted_until` has already passed.
- `account_bans` — only rows with a non-null `expires_at` in the past.
  Permanent bans (`expires_at is null`) are never pruned by age.
- `player_reports` — only rows whose `status` is no longer `open`; an
  unreviewed report is retained regardless of age.
- `moderation_actions` — rows older than the cutoff whose `expires_at` has
  also passed (or is null, meaning the action was instantaneous).

Live enforcement state therefore always outlives the retention window. The
prune runs hourly, bounded to 500 rows per table per pass, so a long-neglected
database drains over several passes instead of one long-held lock.

## Handling exports and deletions

Deleting a character cascades its mutes and reports (`on delete cascade`) and
nulls it out of the action trail (`on delete set null`), so the trail keeps
the shape of past enforcement without pointing at a removed character.

## Known gap

Chat flood escalation (the repeat-offender counter behind escalating mutes) is
in-memory only: it survives relogging but resets on server restart. Recorded in
`TODO.md`.
