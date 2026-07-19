import type { VipActionFailedReason } from "@tibia/protocol";

/** One durable VIP row joined with the listed character's display name. */
export interface VipEntryRecord {
  readonly vipCharacterId: string;
  readonly name: string;
  readonly description: string;
  readonly icon: number;
  readonly notifyLogin: boolean;
}

export interface VipOpFailure {
  readonly status: "failed";
  readonly reason: VipActionFailedReason;
}

export type AddVipResult =
  | { readonly status: "added"; readonly entry: VipEntryRecord }
  | VipOpFailure;

export type VipOpResult = { readonly status: "ok" } | VipOpFailure;

/**
 * Durable per-character VIP storage. Every mutation re-validates inside
 * one transaction at execution time: the target name must resolve, the
 * account-tier cap is counted under the same transaction, and duplicate or
 * self adds surface through database constraints (charter rules 1, 4).
 */
export interface VipStore {
  loadEntries(characterId: string): Promise<ReadonlyArray<VipEntryRecord>>;
  addVip(input: {
    characterId: string;
    targetName: string;
    maxEntries: number;
  }): Promise<AddVipResult>;
  removeVip(input: {
    characterId: string;
    vipCharacterId: string;
  }): Promise<VipOpResult>;
  editVip(input: {
    characterId: string;
    vipCharacterId: string;
    description?: string;
    icon?: number;
    notifyLogin?: boolean;
  }): Promise<VipOpResult>;
}
