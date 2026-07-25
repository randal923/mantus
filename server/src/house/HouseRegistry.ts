import type { HouseAccessLevel, Position } from "@tibia/protocol";
import { positionKey } from "../positionKey";
import {
  EMPTY_HOUSE_ACCESS_LIST,
  type HouseAccessList,
  type HouseAccessSubject,
} from "./HouseAccessList";
import type { HouseSnapshot } from "./HouseStore";
import { matchesHouseAccessList } from "./matchesHouseAccessList";
import { parseHouseAccessList } from "./parseHouseAccessList";

interface ParsedHouseLists {
  readonly guest: HouseAccessList;
  readonly subowner: HouseAccessList;
  readonly doors: ReadonlyMap<string, HouseAccessList>;
}

const EMPTY_PARSED_LISTS: ParsedHouseLists = {
  guest: EMPTY_HOUSE_ACCESS_LIST,
  subowner: EMPTY_HOUSE_ACCESS_LIST,
  doors: new Map(),
};

/**
 * In-memory authoritative cache of owned-house state, mutated only inside
 * the tick from store outcomes. Movement, door, and item authorization read
 * it synchronously; houses without a snapshot are unowned and fail closed.
 * Text access lists are parsed once per store outcome and evaluated against
 * a *live* subject at every check, so guild membership is never cached.
 */
export class HouseRegistry {
  private readonly byHouse = new Map<number, HouseSnapshot>();
  private readonly houseByOwner = new Map<string, number>();
  private readonly listsByHouse = new Map<number, ParsedHouseLists>();

  get(houseId: number): HouseSnapshot | undefined {
    return this.byHouse.get(houseId);
  }

  ownedBy(characterId: string): number | undefined {
    return this.houseByOwner.get(characterId);
  }

  all(): IterableIterator<HouseSnapshot> {
    return this.byHouse.values();
  }

  set(houseId: number, snapshot: HouseSnapshot | null): void {
    const previous = this.byHouse.get(houseId);
    if (previous) this.houseByOwner.delete(previous.ownerCharacterId);
    if (!snapshot) {
      this.byHouse.delete(houseId);
      this.listsByHouse.delete(houseId);
      return;
    }
    this.byHouse.set(houseId, snapshot);
    this.houseByOwner.set(snapshot.ownerCharacterId, houseId);
    const doors = new Map<string, HouseAccessList>();
    let guest = EMPTY_HOUSE_ACCESS_LIST;
    let subowner = EMPTY_HOUSE_ACCESS_LIST;
    for (const list of snapshot.textLists) {
      const parsed = parseHouseAccessList(list.body);
      if (list.kind === "guest") guest = parsed;
      else if (list.kind === "subowner") subowner = parsed;
      else if (list.door) doors.set(positionKey(list.door), parsed);
    }
    this.listsByHouse.set(houseId, { guest, subowner, doors });
  }

  /**
   * Access level for a character. `subject` carries the live name and guild
   * identity used by the text lists; without it only the explicit
   * invitation rows apply.
   */
  accessLevel(
    houseId: number,
    characterId: string,
    subject?: HouseAccessSubject,
  ): HouseAccessLevel {
    const snapshot = this.byHouse.get(houseId);
    if (!snapshot) return "none";
    if (snapshot.ownerCharacterId === characterId) return "owner";
    if (snapshot.subowners.some((entry) => entry.characterId === characterId)) {
      return "subowner";
    }
    const lists = this.listsByHouse.get(houseId) ?? EMPTY_PARSED_LISTS;
    if (subject && matchesHouseAccessList(lists.subowner, subject)) {
      return "subowner";
    }
    if (snapshot.guests.some((entry) => entry.characterId === characterId)) {
      return "guest";
    }
    if (subject && matchesHouseAccessList(lists.guest, subject)) return "guest";
    // A guildhall is open to its own guild without anyone listing them.
    if (snapshot.guildId && subject?.guildId === snapshot.guildId) {
      return "guest";
    }
    return "none";
  }

  /**
   * Per-door authorization. A door with no list of its own is governed by the
   * house-wide access alone; a door with a list additionally requires the
   * character to match it — owners and subowners always pass, as in Canary.
   */
  doorAllows(
    houseId: number,
    level: HouseAccessLevel,
    door: Position,
    subject: HouseAccessSubject | undefined,
  ): boolean {
    if (level === "none") return false;
    if (level === "owner" || level === "subowner") return true;
    const list = this.listsByHouse.get(houseId)?.doors.get(positionKey(door));
    if (!list) return true;
    return subject ? matchesHouseAccessList(list, subject) : false;
  }
}
