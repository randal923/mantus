import type { HouseAccessLevel } from "@tibia/protocol";
import type { HouseSnapshot } from "./HouseStore";

/**
 * In-memory authoritative cache of owned-house state, mutated only inside
 * the tick from store outcomes. Movement, door, and item authorization read
 * it synchronously; houses without a snapshot are unowned and fail closed.
 */
export class HouseRegistry {
  private readonly byHouse = new Map<number, HouseSnapshot>();
  private readonly houseByOwner = new Map<string, number>();

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
      return;
    }
    this.byHouse.set(houseId, snapshot);
    this.houseByOwner.set(snapshot.ownerCharacterId, houseId);
  }

  accessLevel(houseId: number, characterId: string): HouseAccessLevel {
    const snapshot = this.byHouse.get(houseId);
    if (!snapshot) return "none";
    if (snapshot.ownerCharacterId === characterId) return "owner";
    if (snapshot.subowners.some((entry) => entry.characterId === characterId)) {
      return "subowner";
    }
    if (snapshot.guests.some((entry) => entry.characterId === characterId)) {
      return "guest";
    }
    return "none";
  }
}
