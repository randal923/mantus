import type { Party } from "./Party";

/** In-memory index of parties by id and by member (leader included). */
export class PartyRegistry {
  private readonly byId = new Map<string, Party>();
  private readonly byPlayerId = new Map<string, Party>();

  add(party: Party): void {
    this.byId.set(party.id, party);
    this.byPlayerId.set(party.leaderId, party);
  }

  remove(party: Party): void {
    this.byId.delete(party.id);
    for (const memberId of party.allMemberIds()) {
      if (this.byPlayerId.get(memberId) === party) {
        this.byPlayerId.delete(memberId);
      }
    }
  }

  bindMember(playerId: string, party: Party): void {
    this.byPlayerId.set(playerId, party);
  }

  unbindMember(playerId: string): void {
    this.byPlayerId.delete(playerId);
  }

  partyOf(playerId: string): Party | undefined {
    return this.byPlayerId.get(playerId);
  }

  /** Linear scan; party counts are small and invites are short-lived. */
  partiesInviting(playerId: string): Party[] {
    const parties: Party[] = [];
    for (const party of this.byId.values()) {
      if (party.isInvited(playerId)) parties.push(party);
    }
    return parties;
  }

  all(): Iterable<Party> {
    return this.byId.values();
  }
}
