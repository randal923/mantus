import { randomUUID } from "node:crypto";
import {
  GEM_SLOT1_MOD_IDS,
  GEM_SLOT2_MOD_IDS,
  GEM_SUPREME_MODS,
  WHEEL_DOMAINS,
  type GemQuality,
  type RevealedGem,
  type WheelBaseVocation,
} from "@tibia/protocol";

/**
 * Server-side gem reveal roll (charter: all RNG on the server). Lesser
 * gems get one basic mod, regular two (distinct), greater additionally a
 * supreme mod from the vocation's pool.
 */
export function rollRevealedGem(
  quality: GemQuality,
  vocation: WheelBaseVocation,
  random: () => number,
): RevealedGem {
  const pick = <T>(pool: ReadonlyArray<T>): T => {
    const value = pool[Math.floor(random() * pool.length)];
    if (value === undefined) throw new Error("empty gem mod pool");
    return value;
  };
  const domain = pick(WHEEL_DOMAINS);
  const basicModIds = [pick(GEM_SLOT1_MOD_IDS)];
  if (quality !== "lesser") {
    basicModIds.push(
      pick(GEM_SLOT2_MOD_IDS.filter((id) => id !== basicModIds[0])),
    );
  }
  const gem: RevealedGem = {
    id: randomUUID(),
    domain,
    quality,
    locked: false,
    basicModIds,
  };
  if (quality !== "greater") return gem;
  const supremePool = GEM_SUPREME_MODS.filter(
    (mod) => mod.vocations === "all" || mod.vocations.includes(vocation),
  ).map((mod) => mod.id);
  return { ...gem, supremeModId: pick(supremePool) };
}
