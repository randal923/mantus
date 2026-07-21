import { describe, expect, it } from "vitest";
import { loadCreatureContent } from "./loadCreatureContent";

describe("loadCreatureContent", () => {
  it("loads Canary's untargeted Dragon breath as a directional attack", () => {
    const content = loadCreatureContent("world", "otservbr");
    const dragon = content.monsterTypes.get("dragon");
    const breath = dragon?.attacks.find(
      (ability) => ability.area.shape === "cone",
    );

    expect(breath?.target).toBe("direction");
    expect(breath?.area.length).toBe(8);
    expect(dragon?.voices).toEqual([
      {
        intervalMs: 5_000,
        chance: 10,
        text: "FCHHHHH",
        yell: true,
      },
      {
        intervalMs: 5_000,
        chance: 10,
        text: "GROOAAARRR",
        yell: true,
      },
    ]);
    expect(content.monsterTypes.get("werehyaena")?.immunities).toContain(
      "bleeding",
    );
    expect(content.monsterTypes.get("demon")).toMatchObject({
      maxSummons: 1,
      summons: [
        {
          typeId: "fire-elemental",
          intervalMs: 2_000,
          chance: 10,
          maxCount: 1,
        },
      ],
    });
    expect(
      content.monsterTypes
        .get("carnivostrich")
        ?.attacks.find((ability) => ability.minimum === 302),
    ).toBeUndefined();
    expect(
      content.monsterTypes.get("carnivostrich")?.attacks,
    ).toContainEqual(
      expect.objectContaining({ kind: "effect", range: 3 }),
    );
  });

  it("loads every pinned monster through the shared parity rules", () => {
    const types = [
      ...loadCreatureContent("world", "otservbr").monsterTypes.values(),
    ];
    const summoners = types.filter((type) => type.summons.length > 0);
    const voiced = types.filter((type) => type.voices.length > 0);
    const directionalAbilities = types.flatMap((type) => [
      ...type.attacks.filter((ability) => ability.target === "direction"),
      ...type.defenses.filter((ability) => ability.target === "direction"),
    ]);

    expect(types).toHaveLength(897);
    expect(summoners).toHaveLength(68);
    expect(summoners.flatMap((type) => type.summons)).toHaveLength(76);
    expect(voiced).toHaveLength(575);
    expect(voiced.flatMap((type) => type.voices)).toHaveLength(1_537);
    expect(directionalAbilities).toHaveLength(323);
    expect(
      types.filter((type) => type.immunities.includes("invisible")),
    ).toHaveLength(690);
    expect(types.filter((type) => type.speed === 0)).toHaveLength(27);
    expect(
      summoners.every((type) => type.maxSummons > 0),
    ).toBe(true);
  });
});
