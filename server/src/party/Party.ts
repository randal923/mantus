/**
 * One in-memory party (Canary parity: parties do not survive restarts).
 * `memberIds` excludes the leader and keeps join order — the front-most
 * member is auto-promoted when the leader leaves or logs out.
 */
export class Party {
  leaderId: string;
  sharedExpActive = true;
  readonly memberIds: string[] = [];
  readonly inviteeIds: string[] = [];
  private readonly lastActivityAt = new Map<string, number>();

  constructor(
    readonly id: string,
    leaderId: string,
    now: number,
  ) {
    this.leaderId = leaderId;
    this.lastActivityAt.set(leaderId, now);
  }

  /** Leader first, then members in join order. */
  allMemberIds(): string[] {
    return [this.leaderId, ...this.memberIds];
  }

  get size(): number {
    return this.memberIds.length + 1;
  }

  isMember(playerId: string): boolean {
    return this.leaderId === playerId || this.memberIds.includes(playerId);
  }

  isInvited(playerId: string): boolean {
    return this.inviteeIds.includes(playerId);
  }

  invite(playerId: string): void {
    if (!this.inviteeIds.includes(playerId)) this.inviteeIds.push(playerId);
  }

  removeInvite(playerId: string): boolean {
    const index = this.inviteeIds.indexOf(playerId);
    if (index === -1) return false;
    this.inviteeIds.splice(index, 1);
    return true;
  }

  addMember(playerId: string, now: number): void {
    if (this.isMember(playerId)) return;
    this.memberIds.push(playerId);
    this.lastActivityAt.set(playerId, now);
  }

  removeMember(playerId: string): boolean {
    const index = this.memberIds.indexOf(playerId);
    if (index === -1) return false;
    this.memberIds.splice(index, 1);
    this.lastActivityAt.delete(playerId);
    return true;
  }

  /** Canary parity: the old leader re-enters at the front of the member list. */
  passLeadership(newLeaderId: string): boolean {
    if (!this.removeMember(newLeaderId)) return false;
    this.memberIds.unshift(this.leaderId);
    this.leaderId = newLeaderId;
    return true;
  }

  recordActivity(playerId: string, now: number): void {
    if (!this.isMember(playerId)) return;
    this.lastActivityAt.set(playerId, now);
  }

  activityAt(playerId: string): number {
    return this.lastActivityAt.get(playerId) ?? 0;
  }
}
