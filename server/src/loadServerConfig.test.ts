import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadServerConfig } from "./loadServerConfig";

const CONFIG_PATH = fileURLToPath(
  new URL("../../config.yml", import.meta.url),
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("loadServerConfig", () => {
  it("loads the committed server settings", async () => {
    const config = await loadServerConfig(CONFIG_PATH, {});

    expect(config).toMatchObject({
      port: 4000,
      dev: { auth: false, commands: false },
      tickMs: 25,
      trustProxyHeader: false,
      combatSeed: 1129270594,
      rates: {
        experience: expect.any(Number),
        skill: expect.any(Number),
        magic: expect.any(Number),
        loot: expect.any(Number),
        spawn: expect.any(Number),
      },
      chat: {
        bufferCapacity: 4,
        bufferDrainMs: 1500,
        muteBaseMs: 5000,
        escalationDecayMs: 600000,
      },
      moderationRetentionDays: 365,
      map: { source: "data", name: "otservbr", spawnTown: "Thais" },
      creatures: {
        contentName: "world",
        ai: { seed: 1296125524, wanderChance: 0.2 },
      },
    });
  });

  it("loads the committed rarity block with its tuning tables", async () => {
    const config = await loadServerConfig(CONFIG_PATH, {});
    // Chances are live-tuned in config.yml; assert shape, not exact values.
    for (const grade of ["uncommon", "rare", "epic", "legendary"] as const) {
      expect(config.rarity.chances[grade]).toBeGreaterThanOrEqual(0);
    }
    expect(config.rarity.affixCounts).toEqual({
      uncommon: 1,
      rare: 2,
      epic: 3,
      legendary: 4,
    });
    expect(config.rarity.valueMultipliers.legendary).toBe(3);
    expect(config.rarity.affixes.maxHealth).toEqual({
      minimum: 15,
      maximum: 40,
    });
    expect(config.rarity.affixes.magicLevel).toEqual({
      minimum: 1,
      maximum: 1,
      minimumRarity: "rare",
    });
  });

  it("defaults rarity off with the built-in tables when the block is absent", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const directory = await mkdtemp(join(tmpdir(), "server-config-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "config.yml");
    await writeFile(
      path,
      source.replace(/^rarity:\n(?:(?: +.*)?\n)+?(?=^\S)/m, ""),
    );
    const withoutBlock = await loadServerConfig(path, {});
    expect(withoutBlock.rarity.chances).toEqual({
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    });
    expect(withoutBlock.rarity.affixes.resistance).toEqual({
      minimum: 3,
      maximum: 8,
    });
  });

  it("rejects an inverted affix band", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const directory = await mkdtemp(join(tmpdir(), "server-config-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "config.yml");
    await writeFile(
      path,
      source.replace(
        "maxHealth: { min: 15, max: 40 }",
        "maxHealth: { min: 41, max: 40 }",
      ),
    );
    await expect(loadServerConfig(path, {})).rejects.toThrow(
      /config\.rarity\.affixes\.maxHealth/,
    );
  });

  it("rejects out-of-range chat flood limits", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const directory = await mkdtemp(join(tmpdir(), "server-config-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "config.yml");
    await writeFile(path, source.replace("bufferCapacity: 4", "bufferCapacity: 0"));

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      /config\.chat\.bufferCapacity/,
    );
  });

  it("applies validated deployment overrides", async () => {
    const config = await loadServerConfig(CONFIG_PATH, {
      SERVER_PORT: "4100",
      DEV_AUTH: "1",
      TRUST_PROXY: "1",
      CREATURES_ENABLED: "0",
      SPAWN_TOWN: "Venore",
    });

    expect(config.port).toBe(4100);
    expect(config.dev.auth).toBe(true);
    expect(config.trustProxyHeader).toBe(true);
    expect(config.creatures).toBeUndefined();
    if (config.map.source !== "data") {
      throw new Error("expected data map config");
    }
    expect(config.map.spawnTown).toBe("Venore");
  });

  it("rejects unknown settings instead of silently ignoring typos", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(`${source}unknownSetting: true\n`);

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.unknownSetting is unknown",
    );
  });

  it("rejects malformed environment overrides", async () => {
    await expect(
      loadServerConfig(CONFIG_PATH, { TRUST_PROXY: "yes" }),
    ).rejects.toThrow("TRUST_PROXY must be 0 or 1");
  });

  it("rejects an out-of-range experience rate", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(/^  experience:.*$/m, "  experience: -1"),
    );

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.rates.experience must be a number from 0 to 1000",
    );
  });

  it("rejects a fractional bestiary kill rate", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(/^  bestiaryKills:.*$/m, "  bestiaryKills: 1.5"),
    );

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.rates.bestiaryKills",
    );
  });

  it("rejects a zero bosstiary kill rate", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(/^  bosstiaryKills:.*$/m, "  bosstiaryKills: 0"),
    );

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.rates.bosstiaryKills",
    );
  });

  it("rejects a zero spawn rate", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(/^  spawn:.*$/m, "  spawn: 0"),
    );

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.rates.spawn must be greater than 0 and at most 1000",
    );
  });

  it("loads the committed stage tables with an unbounded last band", async () => {
    const { stages } = (await loadServerConfig(CONFIG_PATH, {})).progression;

    expect(stages.experience[0]).toEqual({
      minLevel: 1,
      maxLevel: 8,
      multiplier: 50,
    });
    expect(stages.experience.at(-1)).toEqual({ minLevel: 1_001, multiplier: 2 });
    expect(stages.skill[0]).toEqual({
      minLevel: 10,
      maxLevel: 60,
      multiplier: 15,
    });
    expect(stages.magic[0]).toEqual({
      minLevel: 0,
      maxLevel: 60,
      multiplier: 10,
    });
  });

  it("leaves no gap between the committed experience bands", async () => {
    const { experience } = (await loadServerConfig(CONFIG_PATH, {})).progression
      .stages;

    for (const [index, band] of experience.entries()) {
      if (index === 0) continue;
      expect(band.minLevel).toBe((experience[index - 1]?.maxLevel ?? 0) + 1);
    }
  });

  it("drops the tables when stages are switched off", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(/^    enabled: true$/m, "    enabled: false"),
    );

    expect((await loadServerConfig(path, {})).progression.stages).toEqual({
      experience: [],
      skill: [],
      magic: [],
    });
  });

  it("rejects overlapping stage bands", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(
        "- { minLevel: 9, maxLevel: 50, multiplier: 80 }",
        "- { minLevel: 8, maxLevel: 50, multiplier: 80 }",
      ),
    );

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.progression.stages.experience.1 bands must ascend and must not overlap",
    );
  });

  it("rejects an unbounded band before the last one", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(
        "- { minLevel: 9, maxLevel: 50, multiplier: 80 }",
        "- { minLevel: 9, multiplier: 80 }",
      ),
    );

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.progression.stages.experience.1 may omit maxLevel only in the last band",
    );
  });

  it("rejects a band whose maxLevel is below its minLevel", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(
        "- { minLevel: 10, maxLevel: 60, multiplier: 15 }",
        "- { minLevel: 10, maxLevel: 9, multiplier: 15 }",
      ),
    );

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.progression.stages.skill.0 maxLevel must be at least minLevel",
    );
  });

  it("rejects an out-of-range stage multiplier", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(
        "- { minLevel: 1, maxLevel: 8, multiplier: 50 }",
        "- { minLevel: 1, maxLevel: 8, multiplier: 5000 }",
      ),
    );

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.progression.stages.experience.0.multiplier must be a number from 0 to 1000",
    );
  });
});

async function temporaryConfig(source: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tibia-config-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "config.yml");
  await writeFile(path, source, "utf8");
  return path;
}
