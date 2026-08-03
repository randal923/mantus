import type { CooldownStore, PersistedCooldown } from "./CooldownStore";

export class MemoryCooldownStore implements CooldownStore {
  private readonly rows = new Map<string, ReadonlyArray<PersistedCooldown>>();

  async load(characterId: string): Promise<ReadonlyArray<PersistedCooldown>> {
    return this.rows.get(characterId) ?? [];
  }

  async replace(
    characterId: string,
    cooldowns: ReadonlyArray<PersistedCooldown>,
  ): Promise<void> {
    this.rows.set(
      characterId,
      cooldowns.map((cooldown) => ({ ...cooldown })),
    );
  }
}
