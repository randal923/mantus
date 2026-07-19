import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { withSerializableTransaction } from "./withSerializableTransaction";

function serializationFailure(): Error & { code: string } {
  return Object.assign(
    new Error("could not serialize access due to concurrent update"),
    { code: "40001" },
  );
}

function fakePool(): { pool: Pool; statements: string[] } {
  const statements: string[] = [];
  const client = {
    query: (sql: string) => {
      statements.push(sql);
      return Promise.resolve({ rows: [] });
    },
    release: () => undefined,
  };
  return { pool: { connect: () => Promise.resolve(client) } as unknown as Pool, statements };
}

describe("withSerializableTransaction", () => {
  it("retries serialization aborts and commits the surviving attempt", async () => {
    const { pool, statements } = fakePool();
    let attempts = 0;
    const result = await withSerializableTransaction(pool, async () => {
      attempts += 1;
      if (attempts < 3) throw serializationFailure();
      return "committed";
    });
    expect(result).toBe("committed");
    expect(attempts).toBe(3);
    expect(statements.filter((sql) => sql.includes("ROLLBACK"))).toHaveLength(2);
    expect(statements.filter((sql) => sql.includes("COMMIT"))).toHaveLength(1);
  });

  it("gives up after bounded attempts and surfaces the serialization error", async () => {
    const { pool } = fakePool();
    let attempts = 0;
    await expect(
      withSerializableTransaction(pool, async () => {
        attempts += 1;
        throw serializationFailure();
      }),
    ).rejects.toThrow("could not serialize access");
    expect(attempts).toBe(5);
  });

  it("survives a burst of consecutive collisions within its attempt budget", async () => {
    const { pool } = fakePool();
    let attempts = 0;
    const result = await withSerializableTransaction(pool, async () => {
      attempts += 1;
      // A kill-time save burst: the first four attempts each lose the
      // character-row race to another queued save before one lands.
      if (attempts < 5) throw serializationFailure();
      return "committed";
    });
    expect(result).toBe("committed");
    expect(attempts).toBe(5);
  });

  it("never retries non-transient failures like guarded ops that miss", async () => {
    const { pool, statements } = fakePool();
    let attempts = 0;
    await expect(
      withSerializableTransaction(pool, async () => {
        attempts += 1;
        throw new Error("carried persist write missed item x@1");
      }),
    ).rejects.toThrow("missed item");
    expect(attempts).toBe(1);
    expect(statements.filter((sql) => sql.includes("ROLLBACK"))).toHaveLength(1);
  });
});
