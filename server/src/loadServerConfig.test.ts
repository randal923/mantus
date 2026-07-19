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
      map: { source: "data", name: "otservbr", spawnTown: "Thais" },
      creatures: {
        contentName: "world",
        ai: { seed: 1296125524, wanderChance: 0.2 },
      },
    });
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

  it("rejects a zero spawn rate", async () => {
    const source = await readFile(CONFIG_PATH, "utf8");
    const path = await temporaryConfig(
      source.replace(/^  spawn:.*$/m, "  spawn: 0"),
    );

    await expect(loadServerConfig(path, {})).rejects.toThrow(
      "config.rates.spawn must be greater than 0 and at most 1000",
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
