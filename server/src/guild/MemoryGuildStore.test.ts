import { describe, expect, it } from "vitest";
import { MemoryGuildStore } from "./MemoryGuildStore";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const D = "00000000-0000-4000-8000-00000000000d";

function makeStore(): MemoryGuildStore {
  const store = new MemoryGuildStore();
  store.registerCharacter(A, "Alice");
  store.registerCharacter(B, "Bob");
  store.registerCharacter(C, "Carol");
  store.registerCharacter(D, "Dave");
  return store;
}

describe("MemoryGuildStore", () => {
  it("resolves a same-normalized-name create race to exactly one guild", async () => {
    const store = makeStore();
    const results = await Promise.all([
      store.createGuild({ ownerCharacterId: A, name: "Red Rose" }),
      store.createGuild({ ownerCharacterId: B, name: "  red ROSE " }),
    ]);
    const created = results.filter((result) => result.status === "created");
    expect(created).toHaveLength(1);
    const failed = results.find((result) => result.status === "failed");
    expect(failed && failed.reason).toBe("name-taken");
  });

  it("resolves racing invite acceptances to exactly one membership", async () => {
    const store = makeStore();
    const first = await store.createGuild({ ownerCharacterId: A, name: "One" });
    const second = await store.createGuild({ ownerCharacterId: B, name: "Two" });
    if (first.status !== "created" || second.status !== "created") {
      throw new Error("guild setup failed");
    }
    await store.createInvite({ actorCharacterId: A, targetName: "Carol" });
    await store.createInvite({ actorCharacterId: B, targetName: "Carol" });
    const results = await Promise.all([
      store.respondInvite({ characterId: C, guildId: first.guildId, accept: true }),
      store.respondInvite({ characterId: C, guildId: second.guildId, accept: true }),
    ]);
    const joined = results.filter((result) => result.status === "joined");
    expect(joined).toHaveLength(1);
    expect(await store.loadGuildIdFor(C)).toBe(first.guildId);
  });

  it("rejects a demoted vice's kick at execution time", async () => {
    const store = makeStore();
    const created = await store.createGuild({ ownerCharacterId: A, name: "One" });
    if (created.status !== "created") throw new Error("setup failed");
    await store.createInvite({ actorCharacterId: A, targetName: "Bob" });
    await store.respondInvite({ characterId: B, guildId: created.guildId, accept: true });
    await store.createInvite({ actorCharacterId: A, targetName: "Carol" });
    await store.respondInvite({ characterId: C, guildId: created.guildId, accept: true });
    await store.promoteMember({ actorCharacterId: A, targetCharacterId: B });
    await store.demoteMember({ actorCharacterId: A, targetCharacterId: B });
    const kick = await store.kickMember({ actorCharacterId: B, targetCharacterId: C });
    expect(kick.status).toBe("failed");
    const invite = await store.createInvite({ actorCharacterId: B, targetName: "Dave" });
    expect(invite.status).toBe("failed");
    expect(await store.loadGuildIdFor(C)).toBe(created.guildId);
  });

  it("keeps the leader from leaving without passing or disbanding", async () => {
    const store = makeStore();
    await store.createGuild({ ownerCharacterId: A, name: "One" });
    const left = await store.leaveGuild({ characterId: A });
    expect(left.status === "failed" && left.reason).toBe("leader-cannot-leave");
    await store.createInvite({ actorCharacterId: A, targetName: "Bob" });
    const guildId = await store.loadGuildIdFor(A);
    await store.respondInvite({ characterId: B, guildId: guildId!, accept: true });
    const passed = await store.passLeadership({ actorCharacterId: A, targetCharacterId: B });
    expect(passed.status).toBe("ok");
    const leftNow = await store.leaveGuild({ characterId: A });
    expect(leftNow.status).toBe("ok");
    const snapshot = await store.loadSnapshot(guildId!);
    expect(snapshot?.ownerCharacterId).toBe(B);
  });

  it("allows only one open war per guild pair and one end transition", async () => {
    const store = makeStore();
    const one = await store.createGuild({ ownerCharacterId: A, name: "One" });
    const two = await store.createGuild({ ownerCharacterId: B, name: "Two" });
    if (one.status !== "created" || two.status !== "created") {
      throw new Error("setup failed");
    }
    const declared = await store.declareWar({
      actorCharacterId: A,
      targetGuildName: "Two",
      fragLimit: 1,
    });
    if (declared.status !== "declared") throw new Error("declare failed");
    const duplicate = await store.declareWar({
      actorCharacterId: A,
      targetGuildName: "Two",
      fragLimit: 5,
    });
    expect(duplicate.status === "failed" && duplicate.reason).toBe(
      "war-already-active",
    );
    await store.respondWar({
      actorCharacterId: B,
      warId: declared.warId,
      accept: true,
    });

    // Two simultaneous limit-reaching kills: exactly one war-ended.
    const kills = await Promise.all([
      store.recordWarKill({
        killerCharacterId: A,
        targetCharacterId: B,
        killerGuildId: one.guildId,
        targetGuildId: two.guildId,
      }),
      store.recordWarKill({
        killerCharacterId: A,
        targetCharacterId: B,
        killerGuildId: one.guildId,
        targetGuildId: two.guildId,
      }),
    ]);
    const ended = kills.filter((kill) => kill.status === "war-ended");
    expect(ended).toHaveLength(1);
    expect(ended[0]?.status === "war-ended" && ended[0].winnerGuildId).toBe(
      one.guildId,
    );
    expect(kills.some((kill) => kill.status === "no-war")).toBe(true);
    const snapshot = await store.loadSnapshot(one.guildId);
    expect(snapshot?.wars[0]?.status).toBe(4);
    expect(snapshot?.wars[0]?.guild1Kills).toBe(1);
  });

  it("expires stale pending wars lazily", async () => {
    const store = makeStore();
    await store.createGuild({ ownerCharacterId: A, name: "One" });
    await store.createGuild({ ownerCharacterId: B, name: "Two" });
    const declared = await store.declareWar({
      actorCharacterId: A,
      targetGuildName: "Two",
      fragLimit: 10,
    });
    if (declared.status !== "declared") throw new Error("declare failed");
    const expired = await store.expirePendingWars(
      new Date(Date.now() + 73 * 3600 * 1000),
    );
    expect(expired.map((war) => war.warId)).toEqual([declared.warId]);
    const accept = await store.respondWar({
      actorCharacterId: B,
      warId: declared.warId,
      accept: true,
    });
    expect(accept.status).toBe("failed");
  });
});
