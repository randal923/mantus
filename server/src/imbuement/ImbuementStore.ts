import type { ItemMutation } from "../item/ItemMutation";

export interface ImbuementMutationRequest {
  readonly itemId: string;
  readonly expectedVersion: number;
  /** The item's full replacement attribute bag (imbuements array updated). */
  readonly attributes: Readonly<Record<string, unknown>>;
  /** Astral sources consumed on apply; empty on clear. */
  readonly materials: ReadonlyArray<{
    readonly itemTypeId: number;
    readonly count: number;
  }>;
  readonly goldCost: number;
  readonly auditEvent: "imbuement-apply" | "imbuement-clear";
  readonly auditDetails: Readonly<Record<string, unknown>>;
}

export type ImbuementMutationResult =
  | { readonly status: "committed"; readonly mutation: ItemMutation }
  | {
      readonly status:
        | "insufficient-gold"
        | "insufficient-materials"
        | "conflict";
    };

/**
 * Durable imbuement mutations: one SERIALIZABLE transaction covers the bank
 * debit, the astral-source destruction, the version-guarded item attribute
 * write, and the audit row (charter rules 2 and 11).
 */
export interface ImbuementStore {
  mutate(
    characterId: string,
    request: ImbuementMutationRequest,
  ): Promise<ImbuementMutationResult>;
}
