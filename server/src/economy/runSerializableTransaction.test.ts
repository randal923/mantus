import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { TransactionRollback } from "./TransactionRollback";

function serializationFailure(): Error & { code: string } {
  return Object.assign(
    new Error("could not serialize access due to concurrent update"),
    { code: "40001" },
  );
}

function deadlock(): Error & { code: string } {
  return Object.assign(new Error("deadlock detected"), { code: "40P01" });
}

function connectionReset(): Error & { code: string } {
  return Object.assign(new Error("connection terminated"), {
    code: "ECONNRESET",
  });
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
  return {
    pool: { connect: () => Promise.resolve(client) } as unknown as Pool,
    statements,
  };
}

describe("runSerializableTransaction", () => {
  it("retries serialization aborts and commits the surviving attempt", async () => {
    const { pool, statements } = fakePool();
    let attempts = 0;
    const result = await runSerializableTransaction(pool, async () => {
      attempts += 1;
      if (attempts < 3) throw serializationFailure();
      return "committed";
    });
    expect(result).toBe("committed");
    expect(attempts).toBe(3);
    expect(statements.filter((sql) => sql === "ROLLBACK")).toHaveLength(2);
    expect(statements.filter((sql) => sql === "COMMIT")).toHaveLength(1);
  });

  it("retries deadlocks", async () => {
    const { pool } = fakePool();
    let attempts = 0;
    const result = await runSerializableTransaction(pool, async () => {
      attempts += 1;
      if (attempts < 2) throw deadlock();
      return "committed";
    });
    expect(result).toBe("committed");
    expect(attempts).toBe(2);
  });

  it("gives up after bounded attempts and surfaces the abort", async () => {
    const { pool } = fakePool();
    let attempts = 0;
    await expect(
      runSerializableTransaction(pool, async () => {
        attempts += 1;
        throw serializationFailure();
      }),
    ).rejects.toThrow("could not serialize access");
    expect(attempts).toBe(5);
  });

  it("never retries a business rollback and resolves with its result", async () => {
    const { pool, statements } = fakePool();
    let attempts = 0;
    const result = await runSerializableTransaction(pool, async () => {
      attempts += 1;
      throw new TransactionRollback({ status: "failed", reason: "no-funds" });
    });
    expect(result).toEqual({ status: "failed", reason: "no-funds" });
    expect(attempts).toBe(1);
    expect(statements.filter((sql) => sql === "COMMIT")).toHaveLength(0);
    expect(statements.filter((sql) => sql === "ROLLBACK")).toHaveLength(1);
  });

  it("never retries a connection reset — the commit outcome is ambiguous and money legs are not version-guarded", async () => {
    const { pool } = fakePool();
    let attempts = 0;
    await expect(
      runSerializableTransaction(pool, async () => {
        attempts += 1;
        throw connectionReset();
      }),
    ).rejects.toThrow("connection terminated");
    expect(attempts).toBe(1);
  });

  it("never retries a validation failure", async () => {
    const { pool } = fakePool();
    let attempts = 0;
    await expect(
      runSerializableTransaction(pool, async () => {
        attempts += 1;
        throw new Error("invalid store purchase");
      }),
    ).rejects.toThrow("invalid store purchase");
    expect(attempts).toBe(1);
  });

  it("still resolves a business rollback when the rollback statement itself fails", async () => {
    const client = {
      query: (sql: string) => {
        if (sql === "ROLLBACK") {
          return Promise.reject(new Error("connection already closed"));
        }
        return Promise.resolve({ rows: [] });
      },
      release: () => undefined,
    };
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as Pool;
    const result = await runSerializableTransaction(pool, async () => {
      throw new TransactionRollback({ status: "failed", reason: "not-found" });
    });
    expect(result).toEqual({ status: "failed", reason: "not-found" });
  });
});
