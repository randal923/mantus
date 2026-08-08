import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { makeCharacter } from "../test/makeCharacter";
import { loadNpcDialogueGraphs } from "./loadNpcDialogueGraphs";
import { matchNpcDialogueNode } from "./matchNpcDialogueNode";
import { renderNpcDialogueText } from "./renderNpcDialogueText";

const CONTENT_FILE = fileURLToPath(
  new URL("../../../content/npcs/canary-dialogues.json", import.meta.url),
);
const canaryCommit = String(
  (
    JSON.parse(readFileSync(CONTENT_FILE, "utf8")) as {
      source: { canaryCommit: string };
    }
  ).source.canaryCommit,
);

const graphs = loadNpcDialogueGraphs(canaryCommit);
const henricus = graphs.get("henricus");

function makeLevel120Player(): Player {
  const player = new Player(makeCharacter("pilgrim"), { x: 0, y: 0, z: 7 }, 0);
  player.awardExperience("pilgrim:exp", Number(getExperienceForLevel(120)));
  return player;
}

describe("henricus bless content", () => {
  it("offers the five singles free and the full bless as the premium bundle", () => {
    expect(henricus).toBeDefined();
    const offers = henricus!.nodes.flatMap((node) =>
      node.action?.kind === "bless" ? [node.action] : [],
    );
    const singles = offers.filter((offer) => offer.blessingIds.length === 1);
    expect(singles.map((offer) => offer.blessingIds[0]).sort()).toEqual([
      2, 3, 4, 5, 6,
    ]);
    expect(
      singles.every(
        (offer) => !offer.premium && offer.surchargePercent === 0,
      ),
    ).toBe(true);
    const full = offers.find((offer) => offer.blessingIds.length > 1);
    expect(full).toMatchObject({
      blessingIds: [2, 3, 4, 5, 6],
      surchargePercent: 10,
      premium: true,
    });
  });

  it("keeps the imported shop action the baseline document defined", () => {
    expect(
      henricus!.nodes.some((node) => node.action?.kind === "shop"),
    ).toBe(true);
  });

  it("reaches the full bless from the root and quotes Canary's price", () => {
    const blessing = matchNpcDialogueNode(
      henricus!,
      henricus!.rootNodeId,
      "bless",
    );
    expect(blessing?.id).toBe("blessing");
    const ask = matchNpcDialogueNode(henricus!, blessing!.id, "full");
    expect(ask?.id).toBe("bless-full-ask");
    // Level 120, nothing owned: 20000 a bless, five missing, times 1.1.
    const quoted = renderNpcDialogueText(
      ask!.responses[0]!,
      makeLevel120Player(),
      henricus!,
      ask,
    );
    expect(quoted).toContain("110000 gold");
    const confirmation = matchNpcDialogueNode(henricus!, ask!.id, "yes");
    expect(confirmation?.action?.kind).toBe("bless");
  });

  it("reaches a single bless purchase by keyword", () => {
    const blessing = matchNpcDialogueNode(
      henricus!,
      henricus!.rootNodeId,
      "blessings",
    );
    const ask = matchNpcDialogueNode(henricus!, blessing!.id, "solitude");
    expect(ask?.id).toBe("bless-solitude-ask");
    const quoted = renderNpcDialogueText(
      ask!.responses[0]!,
      makeLevel120Player(),
      henricus!,
      ask,
    );
    expect(quoted).toContain("20000 gold");
    const confirmation = matchNpcDialogueNode(henricus!, ask!.id, "yes");
    expect(confirmation?.action).toMatchObject({
      kind: "bless",
      blessingIds: [2],
    });
  });
});
