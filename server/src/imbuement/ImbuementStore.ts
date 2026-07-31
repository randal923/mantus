import type { ItemMutation } from "../item/ItemMutation";

export interface ImbuementMutationRequest {
  /** Null when nothing is being re-attributed, as in forging a scroll. */
  readonly itemId: string | null;
  readonly expectedVersion: number;
  /** The item's full replacement attribute bag (imbuements array updated). */
  readonly attributes: Readonly<Record<string, unknown>>;
  /** Astral sources destroyed from carried rows; empty on clear. */
  readonly materials: ReadonlyArray<{
    readonly itemTypeId: number;
    readonly count: number;
  }>;
  /**
   * Absolute post-mutation stash counts for the stash share of the sources.
   * The caller has already decremented its memory cache, so these ride the
   * same transaction as the gold debit and the attribute write rather than
   * the depot persist lane — one transaction, no half-spent materials.
   */
  readonly stashOps: ReadonlyArray<{
    readonly itemTypeId: number;
    readonly count: number;
  }>;
  /** Items to create, e.g. the imbuement scroll a forge produces. */
  readonly grants: ReadonlyArray<{
    readonly itemTypeId: number;
    readonly count: number;
  }>;
  readonly goldCost: number;
  readonly auditEvent:
    | "imbuement-apply"
    | "imbuement-clear"
    | "imbuement-scroll-create"
    | "imbuement-scroll-apply";
  readonly auditDetails: Readonly<Record<string, unknown>>;
}

export type ImbuementMutationResult =
  | {
      readonly status: "committed";
      readonly mutation: ItemMutation;
      /** Balance after the debit, so the cached one does not drift. */
      readonly bankBalanceAfter?: number;
    }
  | {
      readonly status:
        | "insufficient-gold"
        | "insufficient-materials"
        | "no-space"
        | "conflict";
    };

/**
 * Durable imbuement mutations: one SERIALIZABLE transaction covers the bank
 * debit, the astral-source destruction (carried rows and stash counts), any
 * granted item, the version-guarded item attribute write, and the audit row
 * (charter rules 2 and 11).
 */
export interface ImbuementStore {
  mutate(
    characterId: string,
    request: ImbuementMutationRequest,
  ): Promise<ImbuementMutationResult>;
}
