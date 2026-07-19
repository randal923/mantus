import { randomUUID } from "node:crypto";
import type { Item } from "../item/Item";

export type TradePhase = "negotiating" | "committing" | "closed";

export interface TradeSide {
  readonly characterId: string;
  /** Reserved subtree snapshot, root first; null until this side offers. */
  offer: ReadonlyArray<Item> | null;
  accepted: boolean;
}

/**
 * Explicit trade state machine (todo 11d), Canary's per-player TradeState_t
 * folded onto one shared object:
 *
 *   negotiating, partner offer null — invite pending (INITIATED/ACKNOWLEDGE)
 *   negotiating, both offers set    — both windows populated (both INITIATED)
 *   negotiating, a side accepted    — TRADE_ACCEPT
 *   committing                      — both accepted, swap in flight
 *                                     (TRADE_TRANSFER); no cancel possible
 *   closed                          — committed or cancelled (TRADE_NONE)
 *
 * Offers are immutable once made (Canary rejects re-offers with "You are
 * already trading."), and accepting requires both offers on the table.
 * Cancellation paths — explicit cancel, range failure, timeout, disconnect,
 * failed commit — run through the owning TradeService, which restores both
 * reserved offers before closing.
 */
export class TradeSession {
  readonly id = randomUUID();
  phase: TradePhase = "negotiating";
  lastActivityAt: number;
  private readonly pair: readonly [TradeSide, TradeSide];

  constructor(
    initiatorCharacterId: string,
    partnerCharacterId: string,
    initiatorOffer: ReadonlyArray<Item>,
    now: number,
  ) {
    this.pair = [
      {
        characterId: initiatorCharacterId,
        offer: initiatorOffer,
        accepted: false,
      },
      { characterId: partnerCharacterId, offer: null, accepted: false },
    ];
    this.lastActivityAt = now;
  }

  get sides(): readonly [TradeSide, TradeSide] {
    return this.pair;
  }

  side(characterId: string): TradeSide | undefined {
    return this.pair.find((side) => side.characterId === characterId);
  }

  partnerOf(characterId: string): TradeSide | undefined {
    return this.pair.find((side) => side.characterId !== characterId);
  }

  /** Only the invited side may answer, with exactly one counter-offer. */
  setOffer(
    characterId: string,
    offer: ReadonlyArray<Item>,
    now: number,
  ): boolean {
    const side = this.side(characterId);
    if (this.phase !== "negotiating" || !side || side.offer) return false;
    side.offer = offer;
    this.lastActivityAt = now;
    return true;
  }

  /** Flips this side to accepted; requires both offers on the table. */
  accept(characterId: string, now: number): "accepted" | "not-ready" | "rejected" {
    const side = this.side(characterId);
    const partner = this.partnerOf(characterId);
    if (this.phase !== "negotiating" || !side || !partner) return "rejected";
    if (!side.offer || !partner.offer) return "not-ready";
    side.accepted = true;
    this.lastActivityAt = now;
    return "accepted";
  }

  get bothAccepted(): boolean {
    return this.pair[0].accepted && this.pair[1].accepted;
  }

  beginCommit(): void {
    this.phase = "committing";
  }

  close(): void {
    this.phase = "closed";
  }
}
