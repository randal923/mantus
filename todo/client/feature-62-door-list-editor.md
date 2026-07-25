# Feature 62 (client) — per-door access-list editor

Part of the [client backlog](README.md). Server side shipped:
[completed log](../completed/implementation-feature-62-completed.md).

## Why
`house-set-list` accepts `kind: "door"` with the door's tile, and
`HouseService` enforces per-door lists at execution time. `HouseTextListSection`
only edits the two house-wide lists, so a player cannot create or edit a door
list at all — the feature is enforced but unreachable.

## Remaining work
- Reach a door list from the door itself: a context-menu entry on a house door
  tile ("Edit door access") for owners and subowners.
- An editor for one door's body, sending
  `setHouseList("door", body, { x, y, z })`.
- Show the existing door lists in `HouseTextListSection` (the count is already
  displayed) as a list of tiles that can be opened or cleared.

## Implementation
- `house.textLists` in `HouseState` already carries every door list with its
  `door` position, so no new server message is needed.
- New `client/components/house/HouseDoorListEditor.tsx`; keep
  `HouseTextListSection` as the house-wide editor and let it render the door
  rows plus a "clear" button (an empty body deletes the row server-side).
- The context-menu hook belongs with the existing map context menu
  (`client/locales/en.json` already has a `contextMenu` section); the entry
  should appear only when `house.myAccess` is `owner` or `subowner` and the
  clicked tile is inside that house.

## Tests
- A Storybook story for `HouseDoorListEditor` with an existing body and an
  empty one.
- Existing `HouseModal.stories.tsx` gains a case with `textLists` containing a
  door entry, so the door-row rendering is visually covered.

## Dependencies
None; server and protocol ship.
