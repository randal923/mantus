import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import type { ShopCatalog } from "../economy/ShopCatalog";
import { gridMapData } from "../gridMapData";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { ItemValuation } from "./ItemValuation";
import { PartyHandler } from "./PartyHandler";

const GOLD_COIN = 3_031;
const HEALTH_POTION = 266;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

const shopCatalogs = (): ReadonlyMap<string, ShopCatalog> =>
  new Map([
    [
      "apothecary",
      {
        npcTypeId: "apothecary",
        entries: [
          {
            offerId: "health-potion",
            itemTypeId: HEALTH_POTION,
            name: "health potion",
            buyPrice: 50,
            sellPrice: 45,
            minimumAmount: 1,
            maximumAmount: 100,
          },
        ],
      } as unknown as ShopCatalog,
    ],
  ]);

function makeHarness() {
  const world = new World(
    gridMapData({ name: "test", width: 12, height: 10, blocked: [], items: [] }),
    25,
  );
  const registry = new SessionRegistry();
  const visibility = new Visibility(world, registry);
  const parties = new PartyHandler(
    world,
    registry,
    visibility,
    undefined,
    new ItemValuation(catalog, shopCatalogs()),
  );
  const join = (characterId: string, x: number) => {
    const player = new Player(makeCharacter(characterId), { x, y: 5, z: 7 });
    world.addPlayer(player);
    const sent: ServerMessage[] = [];
    const socket = {
      OPEN: 1,
      readyState: 1,
      on: vi.fn(),
      send: vi.fn((value: string) => {
        sent.push(JSON.parse(value) as ServerMessage);
      }),
    } as unknown as WebSocket;
    const session = new Session(characterId, "127.0.0.1", socket, {
      maxPendingIntents: 16,
      maxProtocolViolations: 5,
      initialViewRange: { x: 9, y: 7 },
    });
    session.playerId = characterId;
    registry.add(session);
    registry.bindPlayer(session);
    return { player, session, sent };
  };
  return { world, parties, join };
}

/** Leader invites member and the member accepts. */
function formParty(
  harness: ReturnType<typeof makeHarness>,
  leader: { session: Session; player: Player },
  member: { session: Session; player: Player },
  now: number,
) {
  harness.parties.handle(
    leader.session,
    { type: "party-invite", targetName: member.player.name },
    now,
  );
  harness.parties.handle(
    member.session,
    { type: "party-respond-invite", leaderId: leader.player.id, accept: true },
    now + 600,
  );
}

const analyzerMessages = (sent: ReadonlyArray<ServerMessage>) =>
  sent.filter(
    (message): message is Extract<ServerMessage, { type: "party-analyzer" }> =>
      message.type === "party-analyzer",
  );

describe("party analyzer", () => {
  it("aggregates server-recorded loot, supplies, and combat totals", () => {
    const harness = makeHarness();
    const leader = harness.join("leader", 4);
    const member = harness.join("member", 5);
    formParty(harness, leader, member, 1_000);

    harness.parties.recordLoot("leader", GOLD_COIN, 120);
    harness.parties.recordSupply("leader", HEALTH_POTION, 2);
    leader.player.analyzer.recordDamageDealt(500);
    member.player.analyzer.recordHealingDone(80);

    harness.parties.tick(5_000);

    const message = analyzerMessages(leader.sent).at(-1);
    expect(message?.priceMode).toBe("npc");
    expect(message?.entries).toHaveLength(2);
    const leaderRow = message?.entries.find(
      (entry) => entry.playerId === "leader",
    );
    // Gold coins have no NPC sell price; potions sell for 45 each.
    expect(leaderRow).toMatchObject({
      damageDealt: 500,
      lootValue: 0,
      supplyValue: 90,
      balance: -90,
    });
    expect(
      message?.entries.find((entry) => entry.playerId === "member"),
    ).toMatchObject({ healingDone: 80, lootValue: 0, supplyValue: 0 });
  });

  it("switches valuation source when the leader changes the price mode", () => {
    const harness = makeHarness();
    const leader = harness.join("leader", 4);
    const member = harness.join("member", 5);
    formParty(harness, leader, member, 1_000);
    harness.parties.recordLoot("leader", GOLD_COIN, 120);

    harness.parties.handle(
      leader.session,
      { type: "party-set-analyzer-price-mode", mode: "market" },
      2_000,
    );

    const message = analyzerMessages(leader.sent).at(-1);
    expect(message?.priceMode).toBe("market");
    // Catalog worth values a gold coin at 1 each.
    expect(
      message?.entries.find((entry) => entry.playerId === "leader")?.lootValue,
    ).toBe(120);
  });

  it("rejects reset and price-mode changes from a non-leader", () => {
    const harness = makeHarness();
    const leader = harness.join("leader", 4);
    const member = harness.join("member", 5);
    formParty(harness, leader, member, 1_000);
    harness.parties.recordLoot("leader", GOLD_COIN, 10);

    harness.parties.handle(
      member.session,
      { type: "party-reset-analyzer" },
      3_000,
    );
    harness.parties.handle(
      member.session,
      { type: "party-set-analyzer-price-mode", mode: "market" },
      4_000,
    );

    expect(
      member.sent.filter((message) => message.type === "party-action-failed"),
    ).toMatchObject([{ reason: "not-leader" }, { reason: "not-leader" }]);
    harness.parties.tick(5_000);
    const message = analyzerMessages(leader.sent).at(-1);
    expect(message?.priceMode).toBe("npc");
    expect(
      message?.entries.find((entry) => entry.playerId === "leader")?.lootValue,
    ).toBe(0);
  });

  it("clears every member's totals on a leader reset", () => {
    const harness = makeHarness();
    const leader = harness.join("leader", 4);
    const member = harness.join("member", 5);
    formParty(harness, leader, member, 1_000);
    harness.parties.recordSupply("leader", HEALTH_POTION, 4);
    harness.parties.recordSupply("member", HEALTH_POTION, 1);

    harness.parties.handle(
      leader.session,
      { type: "party-reset-analyzer" },
      2_000,
    );

    const message = analyzerMessages(leader.sent).at(-1);
    for (const entry of message?.entries ?? []) {
      expect(entry.supplyValue).toBe(0);
      expect(entry.balance).toBe(0);
    }
  });

  it("never sends the analyzer to a non-member", () => {
    const harness = makeHarness();
    const leader = harness.join("leader", 4);
    const member = harness.join("member", 5);
    const outsider = harness.join("outsider", 6);
    formParty(harness, leader, member, 1_000);
    harness.parties.recordLoot("leader", GOLD_COIN, 5);

    harness.parties.tick(5_000);

    expect(analyzerMessages(outsider.sent)).toEqual([]);
    expect(analyzerMessages(leader.sent).length).toBeGreaterThan(0);
  });

  it("stops sending the analyzer to a member who left", () => {
    const harness = makeHarness();
    const leader = harness.join("leader", 4);
    const member = harness.join("member", 5);
    formParty(harness, leader, member, 1_000);
    harness.parties.tick(5_000);
    expect(analyzerMessages(member.sent).length).toBeGreaterThan(0);
    const before = analyzerMessages(member.sent).length;

    harness.parties.handle(member.session, { type: "party-leave" }, 6_000);
    harness.parties.tick(10_000);

    expect(analyzerMessages(member.sent)).toHaveLength(before);
  });

  it("only counts totals for players the server still has online", () => {
    const harness = makeHarness();
    const leader = harness.join("leader", 4);
    const member = harness.join("member", 5);
    formParty(harness, leader, member, 1_000);

    // A record for a character that is not in the world is dropped outright,
    // so nothing outside the server's own player set can inject a total.
    harness.parties.recordLoot("ghost", GOLD_COIN, 1_000_000);
    harness.parties.tick(5_000);

    const message = analyzerMessages(leader.sent).at(-1);
    expect(message?.entries.map((entry) => entry.playerId)).toEqual([
      "leader",
      "member",
    ]);
  });
});
