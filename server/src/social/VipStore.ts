import type {
  CharacterVocation,
  VipActionFailedReason,
} from "@tibia/protocol";

/** One durable VIP row joined with the listed character's display name. */
export interface VipEntryRecord {
  readonly vipCharacterId: string;
  readonly name: string;
  readonly level: number;
  readonly vocation: CharacterVocation;
  readonly description: string;
  readonly icon: number;
  readonly notifyLogin: boolean;
  /** Null when the entry sits in the ungrouped list. */
  readonly groupId: string | null;
}

/** One named bucket on a character's own VIP list. */
export interface VipGroupRecord {
  readonly groupId: string;
  readonly name: string;
}

export type CreateVipGroupResult =
  | { readonly status: "created"; readonly group: VipGroupRecord }
  | VipOpFailure;

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
  loadGroups(characterId: string): Promise<ReadonlyArray<VipGroupRecord>>;
  createGroup(input: {
    characterId: string;
    name: string;
    maxGroups: number;
  }): Promise<CreateVipGroupResult>;
  /** Scoped to the owner, so another list's group id matches no row. */
  deleteGroup(input: {
    characterId: string;
    groupId: string;
  }): Promise<VipOpResult>;
  /** Moves one own entry into one of the owner's own groups, or out of all. */
  assignGroup(input: {
    characterId: string;
    vipCharacterId: string;
    groupId: string | null;
  }): Promise<VipOpResult>;
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
