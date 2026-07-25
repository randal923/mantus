import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadNpcDialogueGraphs } from "./loadNpcDialogueGraphs";

const CANARY_COMMIT = "a879c9312e34381e8eedf397b8ed44510698b689";
const directory = mkdtempSync(join(tmpdir(), "npc-dialogue-"));

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

interface Defect {
  readonly nodes?: ReadonlyArray<unknown>;
  readonly travelOffers?: ReadonlyArray<unknown>;
  readonly rootNodeId?: string;
}

/** Writes one content document holding a single dialogue and loads it. */
function loadWith(defect: Defect, name: string): () => unknown {
  const path = join(directory, `${name}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      formatVersion: 1,
      source: { canaryCommit: CANARY_COMMIT },
      dialogues: [
        {
          typeId: "subject",
          talkRange: 4,
          timeoutMs: 30_000,
          greetingKeywords: ["hi"],
          farewellKeywords: ["bye"],
          greeting: ["Hello."],
          farewell: ["Bye."],
          walkAway: ["Bye."],
          rootNodeId: defect.rootNodeId ?? "root",
          nodes: defect.nodes ?? [
            {
              id: "root",
              matches: [],
              responses: [],
              children: [],
              choices: [],
            },
          ],
          travelOffers: defect.travelOffers ?? [],
        },
      ],
    }),
  );
  return () => loadNpcDialogueGraphs(CANARY_COMMIT, [path]);
}

const root = {
  id: "root",
  matches: [],
  responses: [],
  children: ["branch"],
  choices: [],
};

function branch(extra: Record<string, unknown>): unknown {
  return {
    id: "branch",
    matches: [["yes"]],
    responses: ["Sure."],
    children: [],
    choices: [],
    ...extra,
  };
}

describe("loadNpcDialogueGraphs fails closed", () => {
  it("rejects an unknown action kind", () => {
    expect(
      loadWith(
        { nodes: [root, branch({ action: { kind: "grant-item", itemId: 1 } })] },
        "unknown-action",
      ),
    ).toThrow("NPC dialogue action is unsupported");
  });

  it("rejects a spell offer the pinned catalog does not define", () => {
    expect(
      loadWith(
        {
          nodes: [
            root,
            branch({
              action: {
                kind: "learn-spell",
                spellId: "exura-nonexistent",
                price: 100,
                minimumLevel: 8,
                premium: false,
              },
            }),
          ],
        },
        "unknown-spell",
      ),
    ).toThrow("references unknown spell exura-nonexistent");
  });

  it("rejects a travel action with no matching offer", () => {
    expect(
      loadWith(
        {
          nodes: [root, branch({ action: { kind: "travel", offerId: "ghost" } })],
        },
        "missing-offer",
      ),
    ).toThrow("references missing travel offer ghost");
  });

  it("rejects a teleport action with no matching offer", () => {
    expect(
      loadWith(
        {
          nodes: [
            root,
            branch({ action: { kind: "teleport", offerId: "ghost" } }),
          ],
        },
        "missing-teleport-offer",
      ),
    ).toThrow("references missing travel offer ghost");
  });

  it("rejects a condition kind the executor cannot evaluate", () => {
    expect(
      loadWith(
        {
          nodes: [
            root,
            branch({ conditions: [{ kind: "has-blessing", blessing: 1 }] }),
          ],
        },
        "unknown-condition",
      ),
    ).toThrow("NPC dialogue condition is unsupported");
  });

  it("rejects an out-of-range storage condition operator", () => {
    expect(
      loadWith(
        {
          nodes: [
            root,
            branch({
              conditions: [
                { kind: "storage", key: "Quest.A", operator: "like", value: 1 },
              ],
            }),
          ],
        },
        "bad-operator",
      ),
    ).toThrow("condition operator is invalid");
  });

  it("rejects a storage key that is not a dotted path", () => {
    expect(
      loadWith(
        {
          nodes: [
            root,
            branch({
              effects: [
                { kind: "set-storage", key: "Quest A; DROP", value: 1 },
              ],
            }),
          ],
        },
        "bad-storage-key",
      ),
    ).toThrow("storage key is invalid");
  });

  it("rejects an effect kind the executor cannot apply", () => {
    expect(
      loadWith(
        {
          nodes: [root, branch({ effects: [{ kind: "add-item", itemId: 2160 }] })],
        },
        "unknown-effect",
      ),
    ).toThrow("NPC dialogue effect is unsupported");
  });

  it("rejects an out-of-range travel destination", () => {
    expect(
      loadWith(
        {
          nodes: [root, branch({ action: { kind: "travel", offerId: "away" } })],
          travelOffers: [
            {
              id: "away",
              cost: 0,
              destination: { x: 1, y: 1, z: 42 },
            },
          ],
        },
        "bad-destination",
      ),
    ).toThrow("NPC travel z is out of range");
  });

  it("rejects duplicate node ids", () => {
    expect(
      loadWith(
        { nodes: [root, branch({}), branch({})] },
        "duplicate-node",
      ),
    ).toThrow("duplicate dialogue node branch");
  });

  it("rejects a root node that does not exist", () => {
    expect(loadWith({ rootNodeId: "elsewhere" }, "missing-root")).toThrow(
      "NPC dialogue root node is missing",
    );
  });

  it("rejects an invalid focus value", () => {
    expect(
      loadWith({ nodes: [root, branch({ focus: "sometimes" })] }, "bad-focus"),
    ).toThrow("NPC dialogue focus is invalid");
  });

  it("rejects an empty hint table", () => {
    expect(
      loadWith(
        {
          nodes: [
            root,
            branch({
              action: { kind: "hint", storageKey: "RookgaardHints", hints: [] },
            }),
          ],
        },
        "empty-hints",
      ),
    ).toThrow("NPC hints must contain 1-64 entries");
  });
});
