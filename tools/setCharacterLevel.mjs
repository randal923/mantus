import { randomUUID } from "node:crypto";

const MAX_CHARACTER_LEVEL = 1_000;
const CHARACTER_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const VOCATION_GAINS = {
  Knight: { health: 15, mana: 5 },
  "Elite Knight": { health: 15, mana: 5 },
  Paladin: { health: 10, mana: 15 },
  "Royal Paladin": { health: 10, mana: 15 },
  Sorcerer: { health: 5, mana: 30 },
  "Master Sorcerer": { health: 5, mana: 30 },
  Druid: { health: 5, mana: 30 },
  "Elder Druid": { health: 5, mana: 30 },
};

function getExperienceForLevel(level) {
  return Math.floor(
    ((((level - 6) * level + 17) * level - 12) * 100) / 6,
  );
}

function getMaximumStats(vocation, level) {
  const gains = VOCATION_GAINS[vocation];
  if (!gains) throw new Error(`unsupported vocation: ${vocation}`);
  const gainedLevels = level - 1;
  return {
    health: 150 + gains.health * gainedLevels,
    mana: 55 + gains.mana * gainedLevels,
  };
}

function readArguments() {
  const [characterName, levelInput, ...options] = process.argv.slice(2);
  const dryRun = options.length === 1 && options[0] === "--dry-run";
  if (
    !characterName ||
    !levelInput ||
    (options.length > 0 && !dryRun)
  ) {
    throw new Error(
      'usage: yarn character:set-level "Character Name" <level> [--dry-run]',
    );
  }
  const normalizedName = characterName.trim().replace(/\s+/g, " ");
  if (
    normalizedName.length < 3 ||
    normalizedName.length > 20 ||
    !CHARACTER_NAME_PATTERN.test(normalizedName)
  ) {
    throw new Error("character name is invalid");
  }
  const level = Number(levelInput);
  if (
    !Number.isInteger(level) ||
    level < 1 ||
    level > MAX_CHARACTER_LEVEL
  ) {
    throw new Error(
      `level must be an integer from 1 to ${MAX_CHARACTER_LEVEL}`,
    );
  }
  return { characterName: normalizedName, level, dryRun };
}

async function setCharacterLevel(characterName, level) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in the environment or root .env");
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  let transactionStarted = false;
  await client.connect();
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const selected = await client.query(
      `SELECT id, display_name, vocation, level, experience, health, mana, version
       FROM characters
       WHERE normalized_name = lower($1)
       FOR UPDATE`,
      [characterName],
    );
    const character = selected.rows[0];
    if (!character) throw new Error(`character not found: ${characterName}`);

    const experience = getExperienceForLevel(level);
    const maximum = getMaximumStats(character.vocation, level);
    const updated = await client.query(
      `UPDATE characters
       SET level = $2,
           experience = $3,
           health = least(health, $4),
           mana = least(mana, $5),
           updated_at = now(),
           version = version + 1
       WHERE id = $1 AND version = $6
       RETURNING display_name, vocation, level, experience, health, mana, version`,
      [
        character.id,
        level,
        experience,
        maximum.health,
        maximum.mana,
        character.version,
      ],
    );
    const result = updated.rows[0];
    if (!result) {
      throw new Error("character changed concurrently; no update was applied");
    }
    await client.query(
      `INSERT INTO progression_events(character_id, event_id, event_type)
       VALUES ($1, $2, 'experience')`,
      [character.id, `admin:set-level:${randomUUID()}`],
    );
    await client.query("COMMIT");
    transactionStarted = false;
    return {
      before: character,
      after: result,
      maximum,
    };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const { characterName, level, dryRun } = readArguments();
  const experience = getExperienceForLevel(level);
  if (dryRun) {
    console.log(
      `Would set "${characterName}" to level ${level} with ${experience} experience.`,
    );
    return;
  }

  console.warn(
    "The game server must be stopped, or the character must be fully offline.",
  );
  const result = await setCharacterLevel(characterName, level);
  console.log(
    `Updated "${result.after.display_name}" from level ${result.before.level} ` +
      `(${result.before.experience} XP) to level ${result.after.level} ` +
      `(${result.after.experience} XP).`,
  );
  console.log(
    `Health: ${result.after.health}/${result.maximum.health}; ` +
      `mana: ${result.after.mana}/${result.maximum.mana}; ` +
      `version: ${result.after.version}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
