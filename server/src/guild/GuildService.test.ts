import { describe, expect, it } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { GuildService } from "./GuildService";
import { MemoryGuildStore } from "./MemoryGuildStore";

interface TestPlayer {
  readonly player: Player;
  readonly session: Session;
  readonly sent: ServerMessage[];
}

interface Harness {
  readonly world: World;
  readonly store: MemoryGuildStore;
  readonly service: GuildService;
  join(id: string, name: string, position?: Position): TestPlayer;
  leave(playerId: string): void;
  flush(now?: number): Promise<void>;
}

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const D = "00000000-0000-4000-8000-00000000000d";

function makeHarness(): Harness {
  const world = new World(
    gridMapData({
      name: "guild-test",
      width: 100,
      height: 100,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const store = new MemoryGuildStore();
  const service = new GuildService(world, registry, visibility, store);
  let nextSpawnX = 40;
  return {
    world,
    store,
    service,
    join(id, name, position) {
      nextSpawnX += 2;
      const spawn = position ?? { x: nextSpawnX, y: 50, z: 7 };
      const player = new Player(makeCharacter(id, name), spawn, 0);
      world.addPlayer(player);
      store.registerCharacter(id, name);
      const sent: ServerMessage[] = [];
      const session = {
        id: `session-${id}`,
        playerId: id,
        viewRange: { x: 8, y: 6 },
        knownCreatureIds: new Set([id]),
        knownMapItemTiles: new Map(),
        attackTargetId: null,
        send: (message: ServerMessage) => sent.push(message),
        sendError: () => {},
      } as unknown as Session;
      sessions.set(id, session);
      service.attachCharacter(session, id);
      return { player, session, sent };
    },
    leave(playerId) {
      service.detachCharacter(playerId);
      sessions.delete(playerId);
      world.removePlayer(playerId);
    },
    async flush(now = 0) {
      // Settle in-flight store operations, then apply their outcomes inside
      // the "tick"; repeat once for outcome-triggered follow-ups.
      for (let round = 0; round < 3; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
    },
  };
}

function messagesOf<TType extends ServerMessage["type"]>(
  testPlayer: TestPlayer,
  type: TType,
): Array<Extract<ServerMessage, { type: TType }>> {
  return testPlayer.sent.filter(
    (message): message is Extract<ServerMessage, { type: TType }> =>
      message.type === type,
  );
}

function lastGuildState(testPlayer: TestPlayer) {
  const states = messagesOf(testPlayer, "guild-state");
  return states[states.length - 1];
}

async function foundGuild(
  harness: Harness,
  leader: TestPlayer,
  name: string,
  clock: { now: number },
): Promise<void> {
  clock.now += 1_100;
  harness.service.handle(
    leader.session,
    { type: "guild-create", name },
    clock.now,
  );
  await harness.flush(clock.now);
}

async function inviteAndJoin(
  harness: Harness,
  actor: TestPlayer,
  joiner: TestPlayer,
  clock: { now: number },
): Promise<void> {
  clock.now += 1_100;
  harness.service.handle(
    actor.session,
    { type: "guild-invite", targetName: joiner.player.name },
    clock.now,
  );
  await harness.flush(clock.now);
  const invitation = messagesOf(joiner, "guild-invitation").at(-1);
  expect(invitation).toBeDefined();
  clock.now += 1_100;
  harness.service.handle(
    joiner.session,
    {
      type: "guild-respond-invite",
      guildId: invitation!.guildId,
      accept: true,
    },
    clock.now,
  );
  await harness.flush(clock.now);
}

describe("GuildService", () => {
  it("concurrent creates with the same normalized name found exactly one guild", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    await harness.flush(clock.now);

    harness.service.handle(
      alice.session,
      { type: "guild-create", name: "Red Rose" },
      clock.now,
    );
    harness.service.handle(
      bob.session,
      { type: "guild-create", name: "  red rose " },
      clock.now,
    );
    await harness.flush(clock.now);

    const aliceState = lastGuildState(alice);
    const bobState = lastGuildState(bob);
    const created = [aliceState?.guild, bobState?.guild].filter(
      (guild) => guild != null,
    );
    expect(created).toHaveLength(1);
    const failures = [
      ...messagesOf(alice, "guild-action-failed"),
      ...messagesOf(bob, "guild-action-failed"),
    ].filter((failure) => failure.reason === "name-taken");
    expect(failures.length).toBeGreaterThanOrEqual(1);
  });

  it("a player accepting two invites ends up in exactly one guild", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    const carol = harness.join(C, "Carol");
    await harness.flush(clock.now);
    await foundGuild(harness, alice, "First Banner", clock);
    await foundGuild(harness, bob, "Second Banner", clock);
    for (const leader of [alice, bob]) {
      clock.now += 1_100;
      harness.service.handle(
        leader.session,
        { type: "guild-invite", targetName: "Carol" },
        clock.now,
      );
      await harness.flush(clock.now);
    }
    const invitations = messagesOf(carol, "guild-invitation");
    expect(invitations).toHaveLength(2);

    // Both accepts race within the same tick window.
    clock.now += 1_100;
    harness.service.handle(
      carol.session,
      {
        type: "guild-respond-invite",
        guildId: invitations[0]!.guildId,
        accept: true,
      },
      clock.now,
    );
    harness.service.handle(
      carol.session,
      {
        type: "guild-respond-invite",
        guildId: invitations[1]!.guildId,
        accept: true,
      },
      clock.now,
    );
    await harness.flush(clock.now);

    const memberships = [
      await harness.store.loadGuildIdFor(C),
    ].filter((guildId) => guildId !== null);
    expect(memberships).toHaveLength(1);
    const state = lastGuildState(carol);
    expect(state?.guild?.members.some((m) => m.characterId === C)).toBe(true);
  });

  it("a demoted vice's invite and kick are re-checked and rejected at execution", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    const carol = harness.join(C, "Carol");
    harness.join(D, "Dave");
    await harness.flush(clock.now);
    await foundGuild(harness, alice, "Iron Pact", clock);
    await inviteAndJoin(harness, alice, bob, clock);
    await inviteAndJoin(harness, alice, carol, clock);
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "guild-promote", targetCharacterId: B },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(
      lastGuildState(bob)?.guild?.members.find((m) => m.characterId === B)
        ?.rankLevel,
    ).toBe(2);

    // The leader demotes Bob; Bob acts on his stale vice permissions.
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "guild-demote", targetCharacterId: B },
      clock.now,
    );
    await harness.flush(clock.now);
    clock.now += 1_100;
    harness.service.handle(
      bob.session,
      { type: "guild-kick", targetCharacterId: C },
      clock.now,
    );
    await harness.flush(clock.now);
    clock.now += 1_100;
    harness.service.handle(
      bob.session,
      { type: "guild-invite", targetName: "Dave" },
      clock.now,
    );
    await harness.flush(clock.now);

    const failures = messagesOf(bob, "guild-action-failed").filter(
      (failure) =>
        failure.reason === "not-authorized" ||
        failure.reason === "cannot-kick-higher-rank",
    );
    expect(failures.length).toBeGreaterThanOrEqual(2);
    expect(
      lastGuildState(carol)?.guild?.members.some((m) => m.characterId === C),
    ).toBe(true);
    expect(await harness.store.loadGuildIdFor(D)).toBeNull();
  });

  it("kicked and departed members lose guild chat at execution time", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    const carol = harness.join(C, "Carol");
    await harness.flush(clock.now);
    await foundGuild(harness, alice, "Iron Pact", clock);
    await inviteAndJoin(harness, alice, bob, clock);
    await inviteAndJoin(harness, alice, carol, clock);

    harness.service.handle(
      bob.session,
      { type: "guild-chat", text: "hello" },
      clock.now,
    );
    expect(messagesOf(alice, "guild-chat-delivered")).toHaveLength(1);
    expect(messagesOf(carol, "guild-chat-delivered")).toHaveLength(1);

    // Kick Bob; his next chat line is rejected against current membership.
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "guild-kick", targetCharacterId: B },
      clock.now,
    );
    await harness.flush(clock.now);
    harness.service.handle(
      bob.session,
      { type: "guild-chat", text: "still here?" },
      clock.now,
    );
    expect(
      messagesOf(bob, "guild-action-failed").some(
        (failure) => failure.reason === "not-in-guild",
      ),
    ).toBe(true);
    expect(messagesOf(alice, "guild-chat-delivered")).toHaveLength(1);

    // Carol leaves and immediately loses the channel too.
    clock.now += 1_100;
    harness.service.handle(carol.session, { type: "guild-leave" }, clock.now);
    await harness.flush(clock.now);
    harness.service.handle(
      carol.session,
      { type: "guild-chat", text: "gone" },
      clock.now,
    );
    expect(
      messagesOf(carol, "guild-action-failed").some(
        (failure) => failure.reason === "not-in-guild",
      ),
    ).toBe(true);
    expect(messagesOf(alice, "guild-chat-delivered")).toHaveLength(1);
  });

  it("never sends roster or invite data to non-members, nor invites to level 1", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    const carol = harness.join(C, "Carol");
    await harness.flush(clock.now);
    await foundGuild(harness, alice, "Iron Pact", clock);
    await inviteAndJoin(harness, alice, bob, clock);
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "guild-invite", targetName: "Carol" },
      clock.now,
    );
    await harness.flush(clock.now);

    // The invitee sees only the invitation itself — never the roster.
    for (const state of messagesOf(carol, "guild-state")) {
      expect(state.guild).toBeNull();
    }
    const invitation = messagesOf(carol, "guild-invitation").at(-1);
    expect(invitation?.guildName).toBe("Iron Pact");
    expect(Object.keys(invitation ?? {}).sort()).toEqual([
      "guildId",
      "guildName",
      "inviterName",
      "type",
    ]);

    // Level-1 members receive no invite list; the leader does.
    const bobState = lastGuildState(bob);
    expect(bobState?.guild?.myRankLevel).toBe(1);
    expect(bobState?.guild?.invites).toBeUndefined();
    const aliceState = lastGuildState(alice);
    expect(aliceState?.guild?.invites?.map((invite) => invite.name)).toEqual([
      "Carol",
    ]);

    // A stranger's session got nothing guild-related at all.
    const dave = harness.join(D, "Dave");
    await harness.flush(clock.now);
    expect(
      dave.sent.filter(
        (message) =>
          message.type === "guild-state" && message.guild !== null,
      ),
    ).toHaveLength(0);
  });

  it("two simultaneous limit-reaching kills end the war exactly once", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    const carol = harness.join(C, "Carol");
    const dave = harness.join(D, "Dave");
    await harness.flush(clock.now);
    await foundGuild(harness, alice, "Iron Pact", clock);
    await inviteAndJoin(harness, alice, carol, clock);
    await foundGuild(harness, bob, "Red Rose", clock);
    await inviteAndJoin(harness, bob, dave, clock);

    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "guild-declare-war", targetGuildName: "Red Rose", fragLimit: 2 },
      clock.now,
    );
    await harness.flush(clock.now);
    const warId = lastGuildState(bob)?.guild?.wars[0]?.warId;
    expect(warId).toBeDefined();
    clock.now += 1_100;
    harness.service.handle(
      bob.session,
      { type: "guild-respond-war", warId: warId!, accept: true },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(harness.service.areAtWar(A, B)).toBe(true);
    expect(harness.service.sameGuild(A, C)).toBe(true);

    // One frag on the books, one remaining before the limit.
    harness.service.recordWarKill(A, B, clock.now);
    await harness.flush(clock.now);
    expect(lastGuildState(alice)?.guild?.wars[0]?.myKills).toBe(1);

    // Both members land the final frag in the same tick.
    harness.service.recordWarKill(A, D, clock.now);
    harness.service.recordWarKill(C, D, clock.now);
    await harness.flush(clock.now);

    const endedForAlice = messagesOf(alice, "guild-event").filter(
      (event) => event.kind === "war-ended",
    );
    expect(endedForAlice).toHaveLength(1);
    expect(endedForAlice[0]?.detail).toBe("Iron Pact");
    expect(
      messagesOf(dave, "guild-event").filter(
        (event) => event.kind === "war-ended",
      ),
    ).toHaveLength(1);
    expect(harness.service.areAtWar(A, B)).toBe(false);
    const war = lastGuildState(alice)?.guild?.wars[0];
    expect(war?.status).toBe("ended");
    expect(war?.myKills).toBe(2);
  });

  it("clears the public flags and caches when the guild disbands", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    await harness.flush(clock.now);
    await foundGuild(harness, alice, "Iron Pact", clock);
    await inviteAndJoin(harness, alice, bob, clock);
    expect(alice.player.guildName).toBe("Iron Pact");
    expect(bob.player.guildName).toBe("Iron Pact");

    clock.now += 1_100;
    harness.service.handle(alice.session, { type: "guild-disband" }, clock.now);
    await harness.flush(clock.now);

    expect(alice.player.guildName).toBeNull();
    expect(bob.player.guildName).toBeNull();
    expect(lastGuildState(bob)?.guild).toBeNull();
    expect(
      messagesOf(bob, "guild-event").some(
        (event) => event.kind === "disbanded",
      ),
    ).toBe(true);
    expect(harness.service.sameGuild(A, B)).toBe(false);
  });
});
