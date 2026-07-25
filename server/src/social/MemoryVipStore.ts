import type { CharacterVocation } from "@tibia/protocol";
import type {
  AddVipResult,
  CreateVipGroupResult,
  VipEntryRecord,
  VipGroupRecord,
  VipOpResult,
  VipStore,
} from "./VipStore";

interface MemoryVipRow {
  description: string;
  icon: number;
  notifyLogin: boolean;
  groupId: string | null;
}

/**
 * In-memory VipStore mirroring the Pg store's execution-time checks
 * (name resolution, self/duplicate rejection, tier cap) so service
 * tests exercise the same failure paths.
 */
export class MemoryVipStore implements VipStore {
  private readonly characters = new Map<
    string,
    {
      readonly name: string;
      readonly level: number;
      readonly vocation: CharacterVocation;
    }
  >();
  private readonly listsByCharacter = new Map<
    string,
    Map<string, MemoryVipRow>
  >();
  private readonly groupsByCharacter = new Map<
    string,
    Map<string, VipGroupRecord>
  >();
  private nextGroupSerial = 0;

  registerCharacter(
    characterId: string,
    name: string,
    level = 1,
    vocation: CharacterVocation = "Knight",
  ): void {
    this.characters.set(characterId, { name, level, vocation });
  }

  async loadEntries(
    characterId: string,
  ): Promise<ReadonlyArray<VipEntryRecord>> {
    const list = this.listsByCharacter.get(characterId);
    if (!list) return [];
    return [...list.entries()].map(([vipCharacterId, row]) => ({
      vipCharacterId,
      name: this.characters.get(vipCharacterId)?.name ?? "?",
      level: this.characters.get(vipCharacterId)?.level ?? 1,
      vocation: this.characters.get(vipCharacterId)?.vocation ?? "Knight",
      description: row.description,
      icon: row.icon,
      notifyLogin: row.notifyLogin,
      groupId: row.groupId,
    }));
  }

  async loadGroups(
    characterId: string,
  ): Promise<ReadonlyArray<VipGroupRecord>> {
    return [...(this.groupsByCharacter.get(characterId)?.values() ?? [])];
  }

  async createGroup(input: {
    characterId: string;
    name: string;
    maxGroups: number;
  }): Promise<CreateVipGroupResult> {
    const groups =
      this.groupsByCharacter.get(input.characterId) ??
      new Map<string, VipGroupRecord>();
    if ([...groups.values()].some((group) => group.name === input.name)) {
      return { status: "failed", reason: "already-added" };
    }
    if (groups.size >= input.maxGroups) {
      return { status: "failed", reason: "list-full" };
    }
    this.nextGroupSerial += 1;
    const group: VipGroupRecord = {
      groupId: `group-${this.nextGroupSerial}`,
      name: input.name,
    };
    groups.set(group.groupId, group);
    this.groupsByCharacter.set(input.characterId, groups);
    return { status: "created", group };
  }

  async deleteGroup(input: {
    characterId: string;
    groupId: string;
  }): Promise<VipOpResult> {
    const groups = this.groupsByCharacter.get(input.characterId);
    if (!groups?.delete(input.groupId)) {
      return { status: "failed", reason: "not-found" };
    }
    // Mirrors `on delete set null`: entries fall back to the ungrouped list.
    for (const row of this.listsByCharacter.get(input.characterId)?.values() ??
      []) {
      if (row.groupId === input.groupId) row.groupId = null;
    }
    return { status: "ok" };
  }

  async assignGroup(input: {
    characterId: string;
    vipCharacterId: string;
    groupId: string | null;
  }): Promise<VipOpResult> {
    const row = this.listsByCharacter
      .get(input.characterId)
      ?.get(input.vipCharacterId);
    if (!row) return { status: "failed", reason: "not-found" };
    if (
      input.groupId !== null &&
      !this.groupsByCharacter.get(input.characterId)?.has(input.groupId)
    ) {
      return { status: "failed", reason: "not-found" };
    }
    row.groupId = input.groupId;
    return { status: "ok" };
  }

  async addVip(input: {
    characterId: string;
    targetName: string;
    maxEntries: number;
  }): Promise<AddVipResult> {
    const wanted = input.targetName.trim().toLowerCase();
    const target = [...this.characters.entries()].find(
      ([, character]) => character.name.toLowerCase() === wanted,
    );
    if (!target) return { status: "failed", reason: "not-found" };
    const [vipCharacterId, character] = target;
    if (vipCharacterId === input.characterId) {
      return { status: "failed", reason: "cannot-add-self" };
    }
    const list =
      this.listsByCharacter.get(input.characterId) ??
      new Map<string, MemoryVipRow>();
    if (list.has(vipCharacterId)) {
      return { status: "failed", reason: "already-added" };
    }
    if (list.size >= input.maxEntries) {
      return { status: "failed", reason: "list-full" };
    }
    const row: MemoryVipRow = {
      description: "",
      icon: 0,
      notifyLogin: false,
      groupId: null,
    };
    list.set(vipCharacterId, row);
    this.listsByCharacter.set(input.characterId, list);
    return {
      status: "added",
      entry: { vipCharacterId, ...character, ...row },
    };
  }

  async removeVip(input: {
    characterId: string;
    vipCharacterId: string;
  }): Promise<VipOpResult> {
    const removed = this.listsByCharacter
      .get(input.characterId)
      ?.delete(input.vipCharacterId);
    if (!removed) return { status: "failed", reason: "not-found" };
    return { status: "ok" };
  }

  async editVip(input: {
    characterId: string;
    vipCharacterId: string;
    description?: string;
    icon?: number;
    notifyLogin?: boolean;
  }): Promise<VipOpResult> {
    const row = this.listsByCharacter
      .get(input.characterId)
      ?.get(input.vipCharacterId);
    if (!row) return { status: "failed", reason: "not-found" };
    if (input.description !== undefined) row.description = input.description;
    if (input.icon !== undefined) row.icon = input.icon;
    if (input.notifyLogin !== undefined) row.notifyLogin = input.notifyLogin;
    return { status: "ok" };
  }
}
