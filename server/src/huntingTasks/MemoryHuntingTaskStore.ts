import type {
  HuntingTaskStore,
  TaskChargeResult,
  TaskClaimResult,
  TaskSlotRecord,
  TaskSnapshot,
  TaskWildcardSpendResult,
} from "./HuntingTaskStore";

/**
 * In-memory HuntingTaskStore mirroring the Pg store's semantics: spends are
 * conditional on balances, and a claim re-checks the stored row's selection,
 * kills, and state, so racing claims grant exactly once.
 */
export class MemoryHuntingTaskStore implements HuntingTaskStore {
  private readonly slots = new Map<string, Map<number, TaskSlotRecord>>();
  private readonly wildcards = new Map<string, number>();
  private readonly taskPoints = new Map<string, number>();
  private readonly gold = new Map<string, number>();
  readonly auditEvents: Array<{
    characterId: string;
    event: string;
    details: Record<string, unknown>;
  }> = [];

  setGold(characterId: string, amount: number): void {
    this.gold.set(characterId, amount);
  }

  goldOf(characterId: string): number {
    return this.gold.get(characterId) ?? 0;
  }

  setWildcards(characterId: string, amount: number): void {
    this.wildcards.set(characterId, amount);
  }

  taskPointsOf(characterId: string): number {
    return this.taskPoints.get(characterId) ?? 0;
  }

  slotRecord(characterId: string, slot: number): TaskSlotRecord | undefined {
    return this.slots.get(characterId)?.get(slot);
  }

  async load(characterId: string): Promise<TaskSnapshot | null> {
    const rows = this.slots.get(characterId);
    if (!rows || rows.size === 0) return null;
    return {
      slots: [...rows.values()].sort((a, b) => a.slot - b.slot),
      taskPoints: this.taskPoints.get(characterId) ?? 0,
      wildcards: this.wildcards.get(characterId) ?? 0,
    };
  }

  async initialize(
    characterId: string,
    slots: ReadonlyArray<TaskSlotRecord>,
  ): Promise<void> {
    const rows =
      this.slots.get(characterId) ?? new Map<number, TaskSlotRecord>();
    for (const record of slots) rows.set(record.slot, { ...record });
    this.slots.set(characterId, rows);
  }

  async saveSlot(characterId: string, record: TaskSlotRecord): Promise<void> {
    const rows =
      this.slots.get(characterId) ?? new Map<number, TaskSlotRecord>();
    rows.set(record.slot, { ...record });
    this.slots.set(characterId, rows);
  }

  async chargeGold(
    characterId: string,
    priceGold: number,
    record: TaskSlotRecord,
    kind: "reroll" | "cancel",
  ): Promise<TaskChargeResult> {
    const balance = this.gold.get(characterId) ?? 0;
    if (balance < priceGold) return { status: "insufficient-gold" };
    this.gold.set(characterId, balance - priceGold);
    await this.saveSlot(characterId, record);
    this.auditEvents.push({
      characterId,
      event: kind === "reroll" ? "hunting-task-reroll" : "hunting-task-cancel",
      details: { slot: record.slot, priceGold },
    });
    return { status: "committed", goldAfter: balance - priceGold };
  }

  async spendWildcards(
    characterId: string,
    cost: number,
    event: "hunting-task-star-reroll" | "hunting-task-wildcard-list",
    record: TaskSlotRecord,
  ): Promise<TaskWildcardSpendResult> {
    const balance = this.wildcards.get(characterId) ?? 0;
    if (balance < cost) return { status: "insufficient-wildcards" };
    this.wildcards.set(characterId, balance - cost);
    await this.saveSlot(characterId, record);
    this.auditEvents.push({
      characterId,
      event,
      details: { slot: record.slot, cost },
    });
    return { status: "committed", wildcardsAfter: balance - cost };
  }

  async claimTask(
    characterId: string,
    expected: { slot: number; raceId: number; minKills: number },
    points: number,
    record: TaskSlotRecord,
  ): Promise<TaskClaimResult> {
    const stored = this.slots.get(characterId)?.get(expected.slot);
    if (
      !stored ||
      stored.selectedRaceId !== expected.raceId ||
      stored.kills < expected.minKills ||
      (stored.state !== "active" && stored.state !== "completed")
    ) {
      return { status: "not-claimable" };
    }
    await this.saveSlot(characterId, record);
    const after = (this.taskPoints.get(characterId) ?? 0) + points;
    this.taskPoints.set(characterId, after);
    this.auditEvents.push({
      characterId,
      event: "hunting-task-claim",
      details: { slot: expected.slot, raceId: expected.raceId, points },
    });
    return { status: "committed", taskPointsAfter: after };
  }
}
