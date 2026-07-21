import type { RevealedGem, WheelDomain } from "@tibia/protocol";
import { equippedGemsOf } from "./equippedGemsOf";
import type {
  GemCharacterData,
  GemResourceBalances,
  GemStore,
} from "./GemStore";

const emptyData = (): MutableGemData => ({
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

interface MutableGemData {
  resources: GemResourceBalances & Record<string, number>;
  revealed: RevealedGem[];
  equipped: Partial<Record<WheelDomain, string>>;
  grades: {
    basic: Array<{ modId: number; grade: number }>;
    supreme: Array<{ modId: number; grade: number }>;
  };
}

/**
 * In-memory gem atelier state for online characters. Loaded once at login
 * and mutated only inside the tick (charter rules 3 and 5). Economy
 * mutations are applied here only after their DB transaction committed;
 * lock/equip changes and kill drops persist write-behind.
 */
export class GemTracker {
  private readonly dataByCharacter = new Map<string, MutableGemData>();
  private readonly pendingWrites = new Set<Promise<void>>();

  constructor(private readonly store?: GemStore) {}

  async load(characterId: string): Promise<GemCharacterData> {
    if (!this.store) return emptyData();
    return this.store.load(characterId);
  }

  attach(characterId: string, data: GemCharacterData): void {
    this.dataByCharacter.set(characterId, {
      resources: { ...data.resources },
      revealed: data.revealed.map((gem) => ({ ...gem })),
      equipped: { ...data.equipped },
      grades: {
        basic: data.grades.basic.map((entry) => ({ ...entry })),
        supreme: data.grades.supreme.map((entry) => ({ ...entry })),
      },
    });
  }

  detachCharacter(characterId: string): void {
    this.dataByCharacter.delete(characterId);
  }

  dataFor(characterId: string): GemCharacterData {
    return this.dataByCharacter.get(characterId) ?? emptyData();
  }

  equippedGems(characterId: string): RevealedGem[] {
    return equippedGemsOf(this.dataFor(characterId));
  }

  /** Applies a committed reveal: one unrevealed gem became `gem`. */
  applyReveal(characterId: string, gem: RevealedGem): void {
    const data = this.dataByCharacter.get(characterId);
    if (!data) return;
    const key = `${gem.quality}Gems`;
    data.resources[key] = Math.max(0, (data.resources[key] ?? 0) - 1);
    data.revealed.push({ ...gem });
  }

  /** Applies a committed destroy: the gem is gone, fragments were credited. */
  applyDestroy(
    characterId: string,
    gemId: string,
    fragment: "lesser" | "greater",
    amount: number,
  ): void {
    const data = this.dataByCharacter.get(characterId);
    if (!data) return;
    data.revealed = data.revealed.filter((gem) => gem.id !== gemId);
    const key = `${fragment}Fragments`;
    data.resources[key] = (data.resources[key] ?? 0) + amount;
  }

  applySwitchDomain(
    characterId: string,
    gemId: string,
    domain: WheelDomain,
  ): void {
    const gem = this.dataByCharacter
      .get(characterId)
      ?.revealed.find((candidate) => candidate.id === gemId);
    if (gem) gem.domain = domain;
  }

  applyImproveGrade(
    characterId: string,
    modKind: "basic" | "supreme",
    modId: number,
    grade: number,
    fragmentCost: number,
  ): void {
    const data = this.dataByCharacter.get(characterId);
    if (!data) return;
    const key = modKind === "basic" ? "lesserFragments" : "greaterFragments";
    data.resources[key] = Math.max(0, (data.resources[key] ?? 0) - fragmentCost);
    const entries = data.grades[modKind];
    const entry = entries.find((candidate) => candidate.modId === modId);
    if (entry) entry.grade = grade;
    else entries.push({ modId, grade });
  }

  /** Lock toggle: synchronous mutation + write-behind persist. */
  setLocked(characterId: string, gemId: string, locked: boolean): void {
    const gem = this.dataByCharacter
      .get(characterId)
      ?.revealed.find((candidate) => candidate.id === gemId);
    if (!gem) return;
    gem.locked = locked;
    this.persist(this.store?.setLocked(characterId, gemId, locked));
  }

  /** Equip/unequip: synchronous mutation + write-behind persist. */
  setEquipped(
    characterId: string,
    domain: WheelDomain,
    gemId: string | null,
  ): void {
    const data = this.dataByCharacter.get(characterId);
    if (!data) return;
    if (gemId === null) delete data.equipped[domain];
    else data.equipped[domain] = gemId;
    this.persist(this.store?.setEquipped(characterId, domain, gemId));
  }

  /** Kill drop: synchronous credit + write-behind persist. */
  creditGemDrops(
    characterId: string,
    deltas: Partial<
      Record<"lesserGems" | "regularGems" | "greaterGems", number>
    >,
  ): void {
    const data = this.dataByCharacter.get(characterId);
    if (!data) return;
    for (const [key, amount] of Object.entries(deltas)) {
      if (!amount) continue;
      data.resources[key] = (data.resources[key] ?? 0) + amount;
    }
    this.persist(this.store?.creditGemDrops(characterId, deltas));
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingWrites]);
  }

  private persist(write: Promise<void> | undefined): void {
    if (!write) return;
    const guarded = write.catch((cause: unknown) => {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`failed to persist gem state: ${reason}`);
    });
    this.pendingWrites.add(guarded);
    void guarded.finally(() => this.pendingWrites.delete(guarded));
  }
}
