import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface HuntingPlace {
  readonly Monsters?: ReadonlyArray<{ readonly Name: string }>;
}

interface MonsterCatalog {
  readonly types: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
}

interface SpawnCatalog {
  readonly slots: ReadonlyArray<{
    readonly typeId: string;
    readonly enabled: boolean;
  }>;
}

const readJson = <T>(relativePath: string): T =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(relativePath, import.meta.url)),
      "utf8",
    ),
  ) as T;

describe("Hunt Finder creature coverage", () => {
  it("has an enabled world spawn for every static Hunt Finder monster", () => {
    const huntingPlaces = readJson<ReadonlyArray<HuntingPlace>>(
      "../../../client/public/assets/hunting/hunting_places.json",
    );
    const monsters = readJson<MonsterCatalog>(
      "../../../content/monsters/world-monsters.json",
    );
    const spawns = readJson<SpawnCatalog>(
      "../../../content/spawns/world-spawns.json",
    );
    const typeIdByName = new Map(
      monsters.types.map((monster) => [monster.name.toLowerCase(), monster.id]),
    );
    const enabledTypeIds = new Set(
      spawns.slots
        .filter((slot) => slot.enabled)
        .map((slot) => slot.typeId),
    );
    const missing = new Set<string>();

    for (const place of huntingPlaces) {
      for (const monster of place.Monsters ?? []) {
        const typeId = typeIdByName.get(monster.Name.toLowerCase());
        if (!typeId || !enabledTypeIds.has(typeId)) missing.add(monster.Name);
      }
    }

    // Canary creates this zero-XP self-destructing quest mechanic dynamically;
    // treating it as a normal persistent map spawn would change its behavior.
    expect([...missing].sort()).toEqual(["Carnisylvan Sapling"]);
  });

  it("keeps the Podzilla Quara population represented in the world", () => {
    const spawns = readJson<SpawnCatalog>(
      "../../../content/spawns/world-spawns.json",
    );
    const counts = new Map<string, number>();

    for (const slot of spawns.slots) {
      if (!slot.enabled) continue;
      counts.set(slot.typeId, (counts.get(slot.typeId) ?? 0) + 1);
    }

    expect(Object.fromEntries(
      ["quara-looter", "quara-plunderer", "quara-raider"].map((typeId) => [
        typeId,
        counts.get(typeId) ?? 0,
      ]),
    )).toEqual({
      "quara-looter": 9,
      "quara-plunderer": 8,
      "quara-raider": 8,
    });
  });
});
