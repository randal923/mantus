import assert from "node:assert/strict";
import test from "node:test";
import { parseCanaryAchievements } from "./parseCanaryAchievements.mjs";

const SAMPLE = `ACHIEVEMENTS = {
\t[1] = { name = "Castlemania", grade = 2, points = 5, secret = true, description = "You have an eye for suspicious places." },
\t[3] = { name = "The Milkman", grade = 1, points = 2, description = "Who's the milkman? You are!" },
\t-- [4] = Unknown/non-existent
\t[32] = { name = "Efreet Ally", grade = 1, points = 3, description = 'Viewed you as "only a human" for quite some time.' },
\t[406] = { name = "The More the Merrier", grade = 1, points = 0, description = "A whole crew." },
\t[513] = { name = "Soul Mender", grade = 4, points = 10, description = "You mended souls." },
}
`;

test("parses double-quoted, single-quoted, secret, and zero-point entries", () => {
  const achievements = parseCanaryAchievements(SAMPLE);
  assert.equal(achievements.length, 5);
  assert.deepEqual(achievements[0], {
    id: 1,
    name: "Castlemania",
    grade: 2,
    points: 5,
    secret: true,
    description: "You have an eye for suspicious places.",
  });
  assert.deepEqual(achievements[1], {
    id: 3,
    name: "The Milkman",
    grade: 1,
    points: 2,
    secret: false,
    description: "Who's the milkman? You are!",
  });
  assert.equal(
    achievements[2].description,
    'Viewed you as "only a human" for quite some time.',
  );
  assert.equal(achievements[3].points, 0);
  assert.equal(achievements[4].grade, 4);
});

test("rejects a line that drifts from the pinned format", () => {
  assert.throws(
    () =>
      parseCanaryAchievements(
        '\t[7] = { name = "Drifted", points = 1, grade = 1, description = "Reordered fields." },\n',
      ),
    /unparsable achievement line/,
  );
});

test("rejects duplicate ids and duplicate names", () => {
  assert.throws(
    () =>
      parseCanaryAchievements(
        '\t[7] = { name = "One", grade = 1, points = 1, description = "A." },\n' +
          '\t[7] = { name = "Two", grade = 1, points = 1, description = "B." },\n',
      ),
    /duplicate achievement id/,
  );
  assert.throws(
    () =>
      parseCanaryAchievements(
        '\t[7] = { name = "One", grade = 1, points = 1, description = "A." },\n' +
          '\t[8] = { name = "One", grade = 1, points = 1, description = "B." },\n',
      ),
    /duplicate achievement name/,
  );
});

test("rejects out-of-range grade and points", () => {
  assert.throws(
    () =>
      parseCanaryAchievements(
        '\t[7] = { name = "One", grade = 5, points = 1, description = "A." },\n',
      ),
    /out-of-range grade/,
  );
  assert.throws(
    () =>
      parseCanaryAchievements(
        '\t[7] = { name = "One", grade = 1, points = 11, description = "A." },\n',
      ),
    /out-of-range points/,
  );
});
