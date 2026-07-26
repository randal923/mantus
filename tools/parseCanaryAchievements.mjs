// Parses the Canary achievement catalog out of register_achievements.lua.
// Lua is read as text and never executed; every entry is one tab-indented
// line of the uniform shape
//   [<id>] = { name = <str>, grade = <n>, points = <n>[, secret = true], description = <str> },
// with the string literals either double- or single-quoted.

const ENTRY_PATTERN =
  /^\t\[(\d+)\] = \{ name = ("(?:[^"\\]*)"|'(?:[^'\\]*)'), grade = (\d+), points = (\d+), (?:(secret = true), )?description = ("(?:[^"\\]*)"|'(?:[^'\\]*)') \},$/;

function readLuaString(literal) {
  return literal.slice(1, -1);
}

export function parseCanaryAchievements(luaSource) {
  const achievements = [];
  const seenIds = new Set();
  const seenNames = new Set();
  for (const line of luaSource.split("\n")) {
    if (!line.startsWith("\t[")) continue;
    const match = ENTRY_PATTERN.exec(line);
    if (!match) {
      throw new Error(`unparsable achievement line: ${line}`);
    }
    const id = Number(match[1]);
    const name = readLuaString(match[2]);
    const grade = Number(match[3]);
    const points = Number(match[4]);
    const secret = match[5] !== undefined;
    const description = readLuaString(match[6]);
    if (seenIds.has(id)) throw new Error(`duplicate achievement id ${id}`);
    if (seenNames.has(name)) {
      throw new Error(`duplicate achievement name ${name}`);
    }
    if (name.length === 0 || description.length === 0) {
      throw new Error(`achievement ${id} has an empty name or description`);
    }
    if (grade < 1 || grade > 4) {
      throw new Error(`achievement ${id} has out-of-range grade ${grade}`);
    }
    if (points > 10) {
      throw new Error(`achievement ${id} has out-of-range points ${points}`);
    }
    seenIds.add(id);
    seenNames.add(name);
    achievements.push({ id, name, grade, points, secret, description });
  }
  achievements.sort((a, b) => a.id - b.id);
  return achievements;
}
