/** Kill-event provenance of a world item that has no DB row yet. */
export interface LootOrigin {
  readonly eventId: string;
  readonly killerCharacterId: string | null;
}
