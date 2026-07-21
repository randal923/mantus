import type {
  GemQuality,
  RevealedGem,
  WheelDomain,
} from "@tibia/protocol";
import { GEM_ATELIER_LIMITS } from "@tibia/protocol";
import type {
  GemCharacterData,
  GemStore,
  GemTransactionResult,
} from "./GemStore";

interface MemoryGemRecord {
  resources: Record<string, number>;
  revealed: RevealedGem[];
  equipped: Partial<Record<WheelDomain, string>>;
  grades: {
    basic: Array<{ modId: number; grade: number }>;
    supreme: Array<{ modId: number; grade: number }>;
  };
}

const emptyRecord = (): MemoryGemRecord => ({
  resources: {
    lesserGems: 0,
    regularGems: 0,
    greaterGems: 0,
    lesserFragments: 0,
    greaterFragments: 0,
  },
  revealed: [],
  equipped: {},
  grades: { basic: [], supreme: [] },
});

/** In-memory GemStore with the same commit/failure semantics as Postgres. */
export class MemoryGemStore implements GemStore {
  private readonly records = new Map<string, MemoryGemRecord>();
  private readonly bankBalances = new Map<string, number>();

  setBankBalance(characterId: string, balance: number): void {
    this.bankBalances.set(characterId, balance);
  }

  seedResources(
    characterId: string,
    resources: Partial<Record<string, number>>,
  ): void {
    const record = this.recordFor(characterId);
    Object.assign(record.resources, resources);
  }

  async load(characterId: string): Promise<GemCharacterData> {
    const record = this.recordFor(characterId);
    return {
      resources: { ...record.resources } as GemCharacterData["resources"],
      revealed: record.revealed.map((gem) => ({ ...gem })),
      equipped: { ...record.equipped },
      grades: {
        basic: record.grades.basic.map((entry) => ({ ...entry })),
        supreme: record.grades.supreme.map((entry) => ({ ...entry })),
      },
    };
  }

  async bankBalance(characterId: string): Promise<number> {
    return this.bankBalances.get(characterId) ?? 0;
  }

  async reveal(
    characterId: string,
    quality: GemQuality,
    gem: RevealedGem,
    goldCost: number,
  ): Promise<GemTransactionResult> {
    const record = this.recordFor(characterId);
    const key = `${quality}Gems`;
    if ((record.resources[key] ?? 0) < 1) return { status: "insufficient-gems" };
    if (record.revealed.length >= GEM_ATELIER_LIMITS.maxRevealedGems) {
      return { status: "gem-limit-reached" };
    }
    const debit = this.debit(characterId, goldCost);
    if (debit === null) return { status: "insufficient-gold" };
    record.resources[key] = (record.resources[key] ?? 0) - 1;
    record.revealed.push({ ...gem });
    return { status: "committed", goldAfter: debit };
  }

  async destroy(
    characterId: string,
    gemId: string,
    fragment: "lesser" | "greater",
    amount: number,
  ): Promise<GemTransactionResult> {
    const record = this.recordFor(characterId);
    const gem = record.revealed.find((candidate) => candidate.id === gemId);
    if (!gem || gem.locked || Object.values(record.equipped).includes(gemId)) {
      return { status: "gem-not-found" };
    }
    record.revealed = record.revealed.filter(
      (candidate) => candidate.id !== gemId,
    );
    const key = `${fragment}Fragments`;
    record.resources[key] = (record.resources[key] ?? 0) + amount;
    return { status: "committed" };
  }

  async switchDomain(
    characterId: string,
    gemId: string,
    domain: WheelDomain,
    goldCost: number,
  ): Promise<GemTransactionResult> {
    const record = this.recordFor(characterId);
    const gem = record.revealed.find((candidate) => candidate.id === gemId);
    if (!gem || gem.locked || Object.values(record.equipped).includes(gemId)) {
      return { status: "gem-not-found" };
    }
    const debit = this.debit(characterId, goldCost);
    if (debit === null) return { status: "insufficient-gold" };
    gem.domain = domain;
    return { status: "committed", goldAfter: debit };
  }

  async improveGrade(
    characterId: string,
    modKind: "basic" | "supreme",
    modId: number,
    nextGrade: number,
    goldCost: number,
    fragmentCost: number,
  ): Promise<GemTransactionResult> {
    const record = this.recordFor(characterId);
    const entries = record.grades[modKind];
    const current =
      entries.find((entry) => entry.modId === modId)?.grade ?? 0;
    if (current !== nextGrade - 1 || nextGrade > GEM_ATELIER_LIMITS.maxGrade) {
      return { status: "max-grade" };
    }
    const fragmentKey =
      modKind === "basic" ? "lesserFragments" : "greaterFragments";
    if ((record.resources[fragmentKey] ?? 0) < fragmentCost) {
      return { status: "insufficient-fragments" };
    }
    const debit = this.debit(characterId, goldCost);
    if (debit === null) return { status: "insufficient-gold" };
    record.resources[fragmentKey] =
      (record.resources[fragmentKey] ?? 0) - fragmentCost;
    const entry = entries.find((candidate) => candidate.modId === modId);
    if (entry) entry.grade = nextGrade;
    else entries.push({ modId, grade: nextGrade });
    return { status: "committed", goldAfter: debit };
  }

  async setLocked(
    characterId: string,
    gemId: string,
    locked: boolean,
  ): Promise<void> {
    const gem = this.recordFor(characterId).revealed.find(
      (candidate) => candidate.id === gemId,
    );
    if (gem) gem.locked = locked;
  }

  async setEquipped(
    characterId: string,
    domain: WheelDomain,
    gemId: string | null,
  ): Promise<void> {
    const record = this.recordFor(characterId);
    if (gemId === null) delete record.equipped[domain];
    else record.equipped[domain] = gemId;
  }

  async creditGemDrops(
    characterId: string,
    deltas: Partial<
      Record<"lesserGems" | "regularGems" | "greaterGems", number>
    >,
  ): Promise<void> {
    const record = this.recordFor(characterId);
    for (const [key, amount] of Object.entries(deltas)) {
      if (!amount) continue;
      record.resources[key] = (record.resources[key] ?? 0) + amount;
    }
  }

  private debit(characterId: string, cost: number): number | null {
    const balance = this.bankBalances.get(characterId) ?? 0;
    if (balance < cost) return null;
    const after = balance - cost;
    this.bankBalances.set(characterId, after);
    return after;
  }

  private recordFor(characterId: string): MemoryGemRecord {
    const existing = this.records.get(characterId);
    if (existing) return existing;
    const created = emptyRecord();
    this.records.set(characterId, created);
    return created;
  }
}
