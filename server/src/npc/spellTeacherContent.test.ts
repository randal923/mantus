import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DialogueGraph } from "./DialogueGraph";
import { loadNpcDialogueGraphs } from "./loadNpcDialogueGraphs";
import { matchNpcDialogueNode } from "./matchNpcDialogueNode";

/**
 * Spell teachers must survive the reviewed-document layer. A hand-written
 * graph replaces the imported one wholesale, so a short override can silently
 * delete every `learn-spell` branch an NPC had — which is exactly what
 * happened to Elane, the teacher standing next to the Thais depot.
 */
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

function offersFor(graph: DialogueGraph): string[] {
  return graph.nodes.flatMap((node) =>
    node.action?.kind === "learn-spell" ? [node.action.spellId] : [],
  );
}

describe("spell teacher content", () => {
  it("keeps every teacher's spell offers after the reviewed documents load", () => {
    const teachers = [...graphs].filter(([, graph]) => offersFor(graph).length > 0);
    expect(teachers.length).toBe(49);
  });

  it("lets a player reach Elane's spell purchases from her root node", () => {
    const graph = graphs.get("elane");
    expect(graph).toBeDefined();
    expect(offersFor(graph!)).toContain("exura");

    const offer = matchNpcDialogueNode(graph!, graph!.rootNodeId, "light healing");
    expect(offer?.responses[0]).toMatch(/would you like to learn/i);
    const confirmation = matchNpcDialogueNode(graph!, offer!.id, "yes");
    expect(confirmation?.action).toMatchObject({
      kind: "learn-spell",
      spellId: "exura",
    });
  });

  it("refuses a later document that drops an imported action", () => {
    const directory = mkdtempSync(join(tmpdir(), "npc-dialogue-override-"));
    try {
      const teacher = writeDocument(directory, "teacher", [
        {
          id: "root",
          matches: [],
          responses: [],
          children: ["buy"],
          choices: [{ nodeId: "buy", label: "Light Healing" }],
        },
        {
          id: "buy",
          matches: [["yes"]],
          responses: ["You have learned 'light healing'."],
          children: [],
          choices: [],
          action: {
            kind: "learn-spell",
            spellId: "exura",
            price: 0,
            minimumLevel: 8,
            premium: false,
          },
        },
      ]);
      const override = writeDocument(directory, "override", [
        {
          id: "root",
          matches: [],
          responses: [],
          children: [],
          choices: [],
        },
      ]);
      expect(() =>
        loadNpcDialogueGraphs(canaryCommit, [teacher, override]),
      ).toThrow(/drops learn-spell actions/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

/** One content document holding a single dialogue for the subject NPC. */
function writeDocument(
  directory: string,
  name: string,
  nodes: ReadonlyArray<unknown>,
): string {
  const path = join(directory, `${name}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      formatVersion: 1,
      source: { canaryCommit },
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
          rootNodeId: "root",
          nodes,
          travelOffers: [],
        },
      ],
    }),
  );
  return path;
}
