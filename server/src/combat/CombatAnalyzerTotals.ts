/**
 * Server-owned combat-analyzer counters for one online player. The client is
 * never trusted with any of this: every number here is accumulated inside the
 * tick from damage the server itself rolled, and it is only ever projected to
 * the owning player and its party (charter rule 6).
 *
 * Counters live on the `Player` instance, so they start at zero on login and
 * disappear with the player on logout — there is no keyed map to leak.
 */
export class CombatAnalyzerTotals {
  private startedAt: number;
  private dealt = 0;
  private taken = 0;
  private healed = 0;

  constructor(now: number) {
    this.startedAt = now;
  }

  get damageDealt(): number {
    return this.dealt;
  }

  get damageTaken(): number {
    return this.taken;
  }

  get healingDone(): number {
    return this.healed;
  }

  elapsedMs(now: number): number {
    return Math.max(0, now - this.startedAt);
  }

  recordDamageDealt(amount: number): void {
    if (amount > 0) this.dealt += amount;
  }

  recordDamageTaken(amount: number): void {
    if (amount > 0) this.taken += amount;
  }

  recordHealingDone(amount: number): void {
    if (amount > 0) this.healed += amount;
  }

  reset(now: number): void {
    this.startedAt = now;
    this.dealt = 0;
    this.taken = 0;
    this.healed = 0;
  }
}
