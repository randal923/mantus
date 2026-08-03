import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  REVELATION_SPELL_GRADES,
  WHEEL_BASE_VOCATION,
  spellCatalogEntrySchema,
} from "@tibia/protocol";
import { Player } from "../../Player";
import { makeCharacter } from "../../test/makeCharacter";
import { SpellRegistry } from "../SpellRegistry";
import { SPELL_DEFINITIONS } from "./SPELL_DEFINITIONS";

const CASTER = { level: 1, magicLevel: 0, skill: 10, attack: 7 };

describe("spell definitions", () => {
  it("keeps the pinned direct spell and rune numbers", () => {
    const spells = SPELL_DEFINITIONS;
    const buzz = spells.find((spell) => spell.name === "Buzz");
    const frontSweep = spells.find(
      (spell) => spell.name === "Lesser Front Sweep",
    );
    const suddenDeath = spells.find(
      (spell) => spell.name === "sudden death rune",
    );
    const haste = spells.find((spell) => spell.name === "Haste");
    const curse = spells.find((spell) => spell.name === "Curse");
    const energyBeam = spells.find((spell) => spell.name === "Energy Beam");
    const magicRope = spells.find((spell) => spell.name === "Magic Rope");
    const levitate = spells.find((spell) => spell.name === "Levitate");

    expect(spells).toHaveLength(179);
    expect(magicRope).toMatchObject({
      id: "exani-tera",
      worldAction: "magic-rope",
      manaCost: 20,
      requiredLevel: 9,
      targetKind: "self",
      effectId: 11,
    });
    expect(levitate).toMatchObject({
      id: "exani-hur",
      worldAction: "levitate",
      manaCost: 50,
      requiredLevel: 12,
    });
    expect(buzz).toMatchObject({
      id: "exori-infir-vis",
      manaCost: 6,
      cooldownMs: 2_000,
      groupCooldownMs: [2_000],
      effectId: 38,
      missileId: 5,
    });
    expect(Math.floor(Math.abs(buzz!.formula.minimum(CASTER)))).toBe(3);
    expect(Math.floor(Math.abs(frontSweep!.formula.maximum(CASTER)))).toBe(18);
    expect(suddenDeath).toMatchObject({
      runeItemTypeId: 3155,
      requiredLevel: 45,
      requiredMagicLevel: 15,
    });
    // AREA_WAVE6 plus its AREADIAGONAL_WAVE6 extended matrix: Canary swaps in
    // a separate matrix for diagonal casts instead of rotating this one.
    expect(frontSweep?.area).toEqual({
      shape: "tiles",
      offsets: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      diagonalOffsets: [
        { x: 1, y: -1 },
        { x: 0, y: 0 },
        { x: -1, y: 1 },
      ],
      directional: true,
    });
    expect(haste?.condition).toEqual({
      type: "haste",
      durationMs: 30_000,
      speedFormula: { coefficient: 1.3, base: 40 },
    });
    expect(curse?.condition?.tickAmounts).toHaveLength(55);
    expect(curse?.condition).toMatchObject({
      type: "curse",
      durationMs: 165_000,
      tickIntervalMs: 3_000,
      damageType: "death",
    });
    expect(
      spells.find((spell) => spell.name === "Heal Friend")?.castRules,
    ).toEqual({
      targetPlayerOnly: true,
      allowSelf: false,
      excludedVocations: [],
      casterEffectId: 15,
    });
    expect(energyBeam).toMatchObject({
      damageType: "energy",
      effectId: 12,
      // AREA_BEAM5, resolved through the local helper that builds the combat.
      area: {
        shape: "tiles",
        offsets: [
          { x: 0, y: -4 },
          { x: 0, y: -3 },
          { x: 0, y: -2 },
          { x: 0, y: -1 },
          { x: 0, y: 0 },
        ],
        diagonalOffsets: [
          { x: -4, y: -4 },
          { x: -3, y: -3 },
          { x: -2, y: -2 },
          { x: -1, y: -1 },
          { x: 0, y: 0 },
        ],
        directional: true,
      },
    });
    expect(
      Math.floor(
        energyBeam!.formula.maximum({ ...CASTER, level: 23, magicLevel: 10 }),
      ),
    ).toBe(53);
  });

  /**
   * These three were disabled purely because their pinned matrices mark the
   * centre with `2` (a centre that is deliberately *not* hit), which the
   * importer used to skip. Canary's `AreaCombat::createArea` treats `2` and
   * `3` alike as the centre and `1` and `3` alike as affected tiles.
   */
  it("keeps the matrix spells whose centre tile is not itself affected", () => {
    const spells = SPELL_DEFINITIONS;
    const iceBurst = spells.find((spell) => spell.name === "Ice Burst");
    const terraBurst = spells.find((spell) => spell.name === "Terra Burst");
    const balancedBrawl = spells.find(
      (spell) => spell.name === "Balanced Brawl",
    );

    // AREA_RING1_BURST3: a ring that spares the 3x3 core around the centre.
    expect(iceBurst?.area.offsets).toHaveLength(48);
    expect(iceBurst?.area.directional).toBe(false);
    for (const offset of iceBurst?.area.offsets ?? []) {
      expect(Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1).toBe(true);
    }
    expect(terraBurst?.area.offsets).toEqual(iceBurst?.area.offsets);
    expect(iceBurst?.wheelRevelation).toEqual({
      domain: "blue",
      minimumStage: 1,
    });
    expect(terraBurst?.wheelRevelation).toEqual(iceBurst?.wheelRevelation);

    // AREA_BALANCED_BRAWL: a directional fan that never covers the caster's
    // own square or the two tiles flanking it.
    expect(balancedBrawl?.playerAction).toBe("balanced-brawl");
    expect(balancedBrawl?.targetKind).toBe("direction");
    expect(balancedBrawl?.area.directional).toBe(true);
    expect(balancedBrawl?.area.offsets).toHaveLength(51);
    expect(balancedBrawl?.area.offsets).not.toContainEqual({ x: 0, y: 0 });
    expect(balancedBrawl?.area.offsets).toContainEqual({ x: 0, y: -5 });
  });

  /**
   * Every castable Wheel of Destiny revelation grant has a definition for
   * exactly its vocation pair, gated on the granting domain. "Drain Body"
   * is the one non-spell grant: it upgrades Sap Strength / Expose Weakness
   * leech instead of being castable itself.
   */
  it("implements every castable wheel revelation grant per vocation", () => {
    const byName = new Map(SPELL_DEFINITIONS.map((spell) => [spell.name, spell]));
    for (const grant of REVELATION_SPELL_GRADES) {
      for (const name of grant.spells) {
        if (name === "Drain Body") continue;
        const spell = byName.get(name);
        expect(spell, `missing revelation spell: ${name}`).toBeDefined();
        expect(spell?.wheelRevelation, name).toEqual({
          domain: grant.domain,
          minimumStage: 1,
        });
        const bases = new Set(
          spell?.vocations.map((vocation) => WHEEL_BASE_VOCATION[vocation]),
        );
        expect([...bases], name).toEqual([grant.vocation]);
        expect(spell?.vocations, name).toHaveLength(2);
      }
    }
  });

  /**
   * The spell-report gate (Feature 26). Every number here is a target that
   * must only ever move down. `ignoredFormulaFields` has reached zero and is
   * locked there; the rest stay pinned to an explicit per-owner budget so a
   * regression fails loudly and so this is the single place to flip to zero
   * when the owning features land.
   */
  it("gates the generated spell report against its parity budget", () => {
    const report = readSpellReport();

    // Non-content is classified out, so the zero target means something.
    expect(report.nonContent).toBe(1);
    expect(report.registered).toBe(report.total - report.nonContent);
    expect(report.registered).toBe(235);
    // Every spell Canary supports has a module. Extra modules are allowed:
    // these files are ours to edit and extend, the dump is only the reference.
    const defined = new Set(SPELL_DEFINITIONS.map((spell) => spell.id));
    expect(
      readSupportedUpstreamIds().filter((id) => !defined.has(id)),
    ).toEqual([]);

    // Reached zero — locked.
    expect(report.ignoredFormulaFields).toBe(0);

    // Not yet zero. Each entry names the feature that owns driving it down.
    expect(report.disabled.byOwner).toEqual({
      // Todo 8 Feature 24 (remaining support-spell callbacks).
      "07-combat": 33,
      // Todo 8 Feature 30 (item decay: fields, walls, bombs).
      "08c-decay": 12,
      // Todo 14 party/house/social spell callbacks.
      "14a-parties": 5,
      "14d-houses": 4,
      "14e-social-services": 2,
      // Todo 15 Features 55-57 and 61-66 (familiars, avatars).
      "15-optional-features": 10,
    });
    expect(report.disabled.spells).toBe(49);
    expect(report.disabled.runes).toBe(17);
    expect(report.disabled.total).toBe(66);
    expect(report.unreviewedCallbacks).toBe(47);
  });

  it("projects only the player's server-owned instant spell metadata", () => {
    const player = new Player(
      makeCharacter("00000000-0000-4000-8000-000000000103"),
      { x: 1, y: 1, z: 7 },
      0,
    );
    const projected = new SpellRegistry().projectFor(player);

    expect(projected.some((spell) => spell.name === "Bruise Bane")).toBe(true);
    expect(projected.some((spell) => spell.name === "Buzz")).toBe(false);
    expect(
      projected.some(
        (spell) =>
          spell.origin === "rune" &&
          spell.runeItemTypeId === 3155,
      ),
    ).toBe(true);
    expect(
      projected.every(
        (spell) => spellCatalogEntrySchema.safeParse(spell).success,
      ),
    ).toBe(true);
  });
});

interface SpellReport {
  readonly total: number;
  readonly nonContent: number;
  readonly registered: number;
  readonly supported: number;
  readonly disabled: {
    readonly total: number;
    readonly spells: number;
    readonly runes: number;
    readonly byOwner: Readonly<Record<string, number>>;
  };
  readonly ignoredFormulaFields: number;
  readonly unreviewedCallbacks: number;
}

function readSpellReport(): SpellReport {
  return readUpstreamDump().report as SpellReport;
}

function readSupportedUpstreamIds(): string[] {
  return (readUpstreamDump().spells as ReadonlyArray<{
    readonly id: string;
    readonly supported: boolean;
  }>)
    .filter((spell) => spell.supported)
    .map((spell) => spell.id);
}

/** The pinned Canary dump, kept as the upstream reference to diff against. */
function readUpstreamDump(): Record<string, unknown> {
  const path = fileURLToPath(
    new URL("../../../../content/spells/canary-spells.json", import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}
