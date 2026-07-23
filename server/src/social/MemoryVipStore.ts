import type { CharacterVocation } from "@tibia/protocol";
import type {
  AddVipResult,
  VipEntryRecord,
  VipOpResult,
  VipStore,
} from "./VipStore";

interface MemoryVipRow {
  description: string;
  icon: number;
  notifyLogin: boolean;
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
    }));
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
