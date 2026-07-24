# Todo 1 — Foundations and Canary parity ledger

The foundation layer shipped: pinned source provenance with era-mismatch failures, offline-only Lua parsing (whitelisted literal subset, no execution), the full numbered-migration system (36 migrations, advisory-locked `migrate.ts`, CI coverage), and the machine-readable parity inventory with CI enforcement — see [done.md](done.md). What remains is the umbrella parity obligation: converting every pinned player-visible definition into project-native typed formats and driving the ledger's 11 open workstreams and 3 release gates to zero unowned omissions.

## Remaining features

- [ ] **Feature 1 — Canary parity ledger: content inventory, open workstreams, and release gates** — Convert every pinned static definition into typed project-native formats and close the 11 open ledger workstreams behind the 3 release gates. See [implementation](implementation-feature-1.md).

[Back to overview](README.md)
