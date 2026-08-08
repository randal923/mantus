import type { Position } from "@tibia/protocol";

export interface DialogueChoiceDefinition {
  readonly nodeId: string;
  readonly label: string;
}

/**
 * A requirement a branch carries. Conditions are re-evaluated at the exact
 * moment the node executes, never when the choice was offered (charter rule
 * 4) — state that changed in between rejects the branch. Storage keys are
 * server-side quest state and are never sent to a client.
 */
export type DialogueCondition =
  | {
      readonly kind: "storage";
      readonly key: string;
      readonly operator: "eq" | "neq" | "gte" | "lte" | "gt" | "lt";
      readonly value: number;
    }
  | { readonly kind: "level"; readonly minimum: number }
  | { readonly kind: "premium"; readonly required: boolean };

/** A state change a branch applies once its action has committed. */
export type DialogueEffect = {
  readonly kind: "set-storage";
  readonly key: string;
  readonly value: number;
};

export type DialogueAction =
  | { readonly kind: "travel"; readonly offerId: string }
  | {
      readonly kind: "promote";
      readonly cost: number;
      readonly minimumLevel: number;
    }
  | { readonly kind: "shop"; readonly shopId: string }
  | { readonly kind: "bank" }
  | {
      /** Buys a spell: bank/carried money leg, audit row, permanent grant. */
      readonly kind: "learn-spell";
      readonly spellId: string;
      readonly price: number;
      readonly minimumLevel: number;
      readonly premium: boolean;
    }
  | {
      /**
       * Buys blessings: bank/carried money leg, audit row, grant held until
       * death. Already-held blessings are skipped and never charged; the
       * price is recomputed from the character's own level and mask at
       * execution time and again from database truth inside the store.
       */
      readonly kind: "bless";
      readonly blessingIds: ReadonlyArray<number>;
      /** Canary's Inquisition surcharge on the summed single prices (10). */
      readonly surchargePercent: number;
      /** The VIP full-bless bundle; re-checked at execution time. */
      readonly premium: boolean;
    }
  | {
      /**
       * Canary StdModule.kick: the NPC teleports the player away for free
       * and drops the conversation. Modelled as a travel offer so the
       * destination goes through the same execution-time walkability and
       * distance checks a paid trip does.
       */
      readonly kind: "teleport";
      readonly offerId: string;
    }
  | {
      /**
       * Canary StdModule.rookgaardHints: says the hint the player's counter
       * points at, then advances it. One hint is one or more spoken lines,
       * matching the pinned table's string-or-table entries.
       */
      readonly kind: "hint";
      readonly storageKey: string;
      readonly hints: ReadonlyArray<ReadonlyArray<string>>;
    }
  | {
      /**
       * Canary's free-text money keywords ("deposit 500", "withdraw 100").
       * The amount is read from the player's own line, so it is untrusted
       * input: it is parsed, bounds-checked, and then re-validated by the
       * same `BankService` path the panel uses.
       */
      readonly kind: "bank-keyword";
      readonly operation: "deposit" | "withdraw";
    };

export interface DialogueNode {
  readonly id: string;
  /** Each inner list is one ordered, contains-all keyword alternative. */
  readonly matches: ReadonlyArray<ReadonlyArray<string>>;
  readonly responses: ReadonlyArray<string>;
  readonly children: ReadonlyArray<string>;
  readonly choices: ReadonlyArray<DialogueChoiceDefinition>;
  readonly nextNodeId?: string;
  /** Used only to render the server-owned price into an offer response. */
  readonly offerId?: string;
  /** All must hold, re-checked at execution time. */
  readonly conditions?: ReadonlyArray<DialogueCondition>;
  /** Applied only after the node's action (if any) has committed. */
  readonly effects?: ReadonlyArray<DialogueEffect>;
  /** Canary `ungreet`: say the line, then end the conversation. */
  readonly ungreet?: boolean;
  /**
   * Canary `onlyUnfocus`: the branch answers only outside a conversation.
   * The default ("focused") is the ordinary in-conversation branch.
   */
  readonly focus?: "focused" | "unfocused";
  readonly action?: DialogueAction;
}

export interface NpcTravelOffer {
  readonly id: string;
  readonly cost: number;
  readonly destination: Position;
  readonly diversion?: {
    readonly oneIn: number;
    readonly destination: Position;
  };
  readonly minimumLevel?: number;
  /**
   * Access gate (quest storage, level, premium). Evaluated when the player
   * confirms, never when the route was listed — state can move between the
   * two (charter rule 4). Keys are server-side quest paths and never reach a
   * client: a gated route the player cannot take is simply refused.
   */
  readonly conditions?: ReadonlyArray<DialogueCondition>;
  /**
   * Server-owned fare reductions (Postman ranks and friends). The first entry
   * whose conditions hold sets the fare; the client never supplies a price.
   */
  readonly discounts?: ReadonlyArray<TravelDiscount>;
}

export interface TravelDiscount {
  readonly conditions: ReadonlyArray<DialogueCondition>;
  readonly cost: number;
}

export interface DialogueGraph {
  readonly talkRange: number;
  readonly timeoutMs: number;
  readonly greetingKeywords: ReadonlyArray<string>;
  readonly farewellKeywords: ReadonlyArray<string>;
  readonly greeting: ReadonlyArray<string>;
  readonly farewell: ReadonlyArray<string>;
  readonly walkAway: ReadonlyArray<string>;
  readonly rootNodeId: string;
  readonly nodes: ReadonlyArray<DialogueNode>;
  readonly travelOffers: ReadonlyArray<NpcTravelOffer>;
}
