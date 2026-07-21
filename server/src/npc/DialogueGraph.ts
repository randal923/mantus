import type { Position } from "@tibia/protocol";

export interface DialogueChoiceDefinition {
  readonly nodeId: string;
  readonly label: string;
}

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
  readonly action?:
    | { readonly kind: "travel"; readonly offerId: string }
    | { readonly kind: "shop"; readonly shopId: string }
    | { readonly kind: "bank" };
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
