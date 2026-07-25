import { describe, expect, it } from "vitest";
import { MemoryGuildStore } from "./MemoryGuildStore";

async function makeGuild() {
  const store = new MemoryGuildStore();
  store.registerCharacter("leader", "Leader");
  store.registerCharacter("member", "Member");
  const created = await store.createGuild({
    ownerCharacterId: "leader",
    name: "Red Rose",
  });
  if (created.status !== "created") throw new Error("guild create failed");
  const invited = await store.createInvite({
    actorCharacterId: "leader",
    targetName: "Member",
  });
  if (invited.status !== "invited") throw new Error("invite failed");
  await store.respondInvite({
    characterId: "member",
    guildId: created.guildId,
    accept: true,
  });
  return { store, guildId: created.guildId };
}

describe("guild bank", () => {
  it("moves a member's bank gold into the shared balance", async () => {
    const { store, guildId } = await makeGuild();
    store.setBankBalance("member", 5_000);

    const result = await store.depositToGuildBank({
      actorCharacterId: "member",
      amount: 1_500,
    });

    expect(result).toEqual({
      status: "ok",
      guildBalance: 1_500,
      characterBalance: 3_500,
    });
    expect(store.guildBalance(guildId)).toBe(1_500);
    // Gold is conserved: what left the member's bank arrived in the guild.
    expect(store.bankBalance("member") + store.guildBalance(guildId)).toBe(
      5_000,
    );
  });

  it("refuses a deposit larger than the member's bank balance", async () => {
    const { store, guildId } = await makeGuild();
    store.setBankBalance("member", 100);

    expect(
      await store.depositToGuildBank({
        actorCharacterId: "member",
        amount: 101,
      }),
    ).toEqual({ status: "failed", reason: "insufficient-funds" });
    expect(store.guildBalance(guildId)).toBe(0);
    expect(store.bankBalance("member")).toBe(100);
  });

  it("only lets the leader withdraw", async () => {
    const { store, guildId } = await makeGuild();
    store.setBankBalance("member", 1_000);
    await store.depositToGuildBank({
      actorCharacterId: "member",
      amount: 1_000,
    });

    expect(
      await store.withdrawFromGuildBank({
        actorCharacterId: "member",
        amount: 500,
      }),
    ).toEqual({ status: "failed", reason: "not-authorized" });
    expect(store.guildBalance(guildId)).toBe(1_000);

    expect(
      await store.withdrawFromGuildBank({
        actorCharacterId: "leader",
        amount: 500,
      }),
    ).toEqual({ status: "ok", guildBalance: 500, characterBalance: 500 });
  });

  it("racing withdrawals cannot drive the balance negative", async () => {
    const { store, guildId } = await makeGuild();
    store.setBankBalance("member", 1_000);
    await store.depositToGuildBank({
      actorCharacterId: "member",
      amount: 1_000,
    });

    const [first, second] = await Promise.all([
      store.withdrawFromGuildBank({
        actorCharacterId: "leader",
        amount: 700,
      }),
      store.withdrawFromGuildBank({
        actorCharacterId: "leader",
        amount: 700,
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["failed", "ok"]);
    expect(store.guildBalance(guildId)).toBe(300);
    expect(store.bankBalance("leader")).toBe(700);
  });

  it("refuses a non-member entirely", async () => {
    const { store } = await makeGuild();
    store.setBankBalance("stranger", 1_000);

    expect(
      await store.depositToGuildBank({
        actorCharacterId: "stranger",
        amount: 10,
      }),
    ).toEqual({ status: "failed", reason: "not-in-guild" });
  });

  it("derives the guild level from accumulated points", async () => {
    const { store, guildId } = await makeGuild();

    expect(await store.addGuildPoints({ guildId, points: 999 })).toEqual({
      points: 999,
      level: 1,
    });
    expect(await store.addGuildPoints({ guildId, points: 1 })).toEqual({
      points: 1_000,
      level: 2,
    });
    expect(await store.addGuildPoints({ guildId: "nope", points: 1 })).toBeNull();
  });

  it("reports the balance and level in the member projection", async () => {
    const { store, guildId } = await makeGuild();
    store.setBankBalance("member", 2_000);
    await store.depositToGuildBank({
      actorCharacterId: "member",
      amount: 2_000,
    });
    await store.addGuildPoints({ guildId, points: 3_000 });

    const snapshot = await store.loadSnapshot(guildId);
    expect(snapshot).toMatchObject({ balance: 2_000, points: 3_000, level: 4 });
  });
});
