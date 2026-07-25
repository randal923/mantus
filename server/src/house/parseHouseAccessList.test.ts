import { describe, expect, it } from "vitest";
import { HOUSE_LIMITS } from "@tibia/protocol";
import type { HouseAccessSubject } from "./HouseAccessList";
import { matchesHouseAccessList } from "./matchesHouseAccessList";
import { parseHouseAccessList } from "./parseHouseAccessList";

const subject = (
  name: string,
  guildName: string | null = null,
  guildRankName: string | null = null,
): HouseAccessSubject => ({ name, guildName, guildRankName });

const allows = (body: string, who: HouseAccessSubject): boolean =>
  matchesHouseAccessList(parseHouseAccessList(body), who);

describe("parseHouseAccessList", () => {
  it("matches exact names case-insensitively and ignores comments", () => {
    const body = "# my friends\nMirella\n\n  Thorgal  \n";
    expect(allows(body, subject("mirella"))).toBe(true);
    expect(allows(body, subject("THORGAL"))).toBe(true);
    expect(allows(body, subject("Cara"))).toBe(false);
    // A comment line is never a name, even one that looks like one.
    expect(allows(body, subject("my friends"))).toBe(false);
  });

  it("grants everyone only for a bare star line", () => {
    expect(allows("*", subject("Anyone"))).toBe(true);
    expect(allows("Mir*", subject("Anyone"))).toBe(false);
    expect(allows("Mir*", subject("Mirella"))).toBe(true);
  });

  it("resolves guild and rank entries against the live subject", () => {
    const body = "@Red Rose\nLeader@Blue Lotus";
    expect(allows(body, subject("Ann", "Red Rose", "Member"))).toBe(true);
    // Rank entries are narrower than a whole-guild entry.
    expect(allows(body, subject("Ben", "Blue Lotus", "Member"))).toBe(false);
    expect(allows(body, subject("Ben", "Blue Lotus", "Leader"))).toBe(true);
    // Leaving the guild removes access immediately: same list, new subject.
    expect(allows(body, subject("Ann", null, null))).toBe(false);
  });

  it("lets an earlier exclusion beat a later wildcard", () => {
    const body = "!Mir*\nM*";
    expect(allows(body, subject("Mirella"))).toBe(false);
    expect(allows(body, subject("Malik"))).toBe(true);
    expect(allows(body, subject("Zora"))).toBe(false);
  });

  it("treats regex metacharacters in a name as literal text", () => {
    // A player cannot smuggle a pattern in through an ordinary-looking entry.
    const list = parseHouseAccessList("a.c*");
    expect(matchesHouseAccessList(list, subject("a.civilian"))).toBe(true);
    expect(matchesHouseAccessList(list, subject("abcivilian"))).toBe(false);
  });

  it("skips over-long lines and caps the number of lines parsed", () => {
    const long = "x".repeat(HOUSE_LIMITS.maxAccessListLineLength + 1);
    expect(allows(`${long}\nMirella`, subject(long))).toBe(false);
    expect(allows(`${long}\nMirella`, subject("Mirella"))).toBe(true);

    const overflow = [
      ...Array.from({ length: HOUSE_LIMITS.maxAccessListLines }, (_, i) =>
        String(`Filler ${i}`),
      ),
      "Mirella",
    ].join("\n");
    expect(allows(overflow, subject("Mirella"))).toBe(false);
    expect(allows(overflow, subject("Filler 0"))).toBe(true);
  });

  it("returns an empty list for blank and whitespace-only bodies", () => {
    for (const body of ["", "   ", "\n\n"]) {
      const list = parseHouseAccessList(body);
      expect(list.everyone).toBe(false);
      expect(list.names.size).toBe(0);
      expect(matchesHouseAccessList(list, subject("Anyone"))).toBe(false);
    }
  });
});
