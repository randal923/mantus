import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCreatureContent } from "../spawn/loadCreatureContent";
import { getMagicEffectId } from "./getMagicEffectId";
import { getMissileId } from "./getMissileId";
import { loadCanarySpellCatalog } from "./loadCanarySpellCatalog";

/**
 * "Can I see it on screen?" — every magic effect and distance missile the
 * server can broadcast (player spells, runes, and all 911 monster abilities)
 * must resolve to a client sprite asset with at least one frame. A missing
 * entry renders as nothing or a generic poff on the real client.
 */

const OBJECTS_PATH = fileURLToPath(
  new URL("../../../client/public/assets/objects.json", import.meta.url),
);

interface ClientObject {
  category: string;
  clientId: number;
  phases: number;
  sprites: number[];
}

function loadClientAssets(): {
  effects: Map<number, ClientObject>;
  missiles: Map<number, ClientObject>;
} {
  const parsed = JSON.parse(readFileSync(OBJECTS_PATH, "utf8")) as {
    objects: ClientObject[];
  };
  const effects = new Map<number, ClientObject>();
  const missiles = new Map<number, ClientObject>();
  for (const object of parsed.objects) {
    if (object.category === "effect") effects.set(object.clientId, object);
    if (object.category === "missile") missiles.set(object.clientId, object);
  }
  return { effects, missiles };
}

const { effects, missiles } = loadClientAssets();

const renderableEffect = (id: number) => {
  const asset = effects.get(id);
  return (
    asset !== undefined &&
    asset.sprites.length > 0 &&
    asset.sprites.some((sprite) => sprite > 0)
  );
};

const renderableMissile = (id: number) => {
  const asset = missiles.get(id);
  return (
    asset !== undefined &&
    asset.sprites.length > 0 &&
    asset.sprites.some((sprite) => sprite > 0)
  );
};

describe("combat visual assets", () => {
  it("renders every supported spell's magic effect, caster effect, and missile", () => {
    const missing: string[] = [];
    for (const spell of loadCanarySpellCatalog()) {
      if (spell.effectId > 0 && !renderableEffect(spell.effectId)) {
        missing.push(`${spell.id}: effect ${spell.effectId}`);
      }
      if (
        spell.casterEffectId > 0 &&
        !renderableEffect(spell.casterEffectId)
      ) {
        missing.push(`${spell.id}: caster effect ${spell.casterEffectId}`);
      }
      const ruleEffect = spell.castRules?.casterEffectId ?? 0;
      if (ruleEffect > 0 && !renderableEffect(ruleEffect)) {
        missing.push(`${spell.id}: cast-rule effect ${ruleEffect}`);
      }
      if (spell.missileId !== null && !renderableMissile(spell.missileId)) {
        missing.push(`${spell.id}: missile ${spell.missileId}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("renders every monster ability effect, path effect, and missile", () => {
    const content = loadCreatureContent("world", "otservbr");
    const missing = new Set<string>();
    for (const [typeId, monster] of content.monsterTypes) {
      for (const ability of [...monster.attacks, ...monster.defenses]) {
        if (ability.effect !== undefined) {
          const id = getMagicEffectId(ability.effect);
          if (!renderableEffect(id)) {
            missing.add(`${typeId}: effect ${String(ability.effect)} -> ${id}`);
          }
        }
        if (ability.pathEffect !== undefined) {
          const id = getMagicEffectId(ability.pathEffect);
          if (!renderableEffect(id)) {
            missing.add(
              `${typeId}: path effect ${String(ability.pathEffect)} -> ${id}`,
            );
          }
        }
        if (ability.chain?.effect !== undefined) {
          const id = getMagicEffectId(ability.chain.effect);
          if (!renderableEffect(id)) {
            missing.add(
              `${typeId}: chain effect ${String(ability.chain.effect)} -> ${id}`,
            );
          }
        }
        if (ability.missile !== undefined) {
          const id = getMissileId(ability.missile);
          if (id !== undefined && !renderableMissile(id)) {
            missing.add(
              `${typeId}: missile ${String(ability.missile)} -> ${id}`,
            );
          }
        }
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  it("renders the hardcoded combat-system effects (fields, teleports, blocks)", () => {
    // Fire/poison/energy field visuals, teleport, poff, magic-wall break.
    for (const id of [7, 21, 38, 11, 3]) {
      expect(renderableEffect(id), `effect ${id}`).toBe(true);
    }
  });
});
