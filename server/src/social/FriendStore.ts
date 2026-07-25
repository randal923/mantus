import type { VipActionFailedReason } from "@tibia/protocol";

/** One friend or pending request row joined with its display name. */
export interface FriendRecord {
  readonly characterId: string;
  readonly name: string;
}

/** A character's whole reciprocal-social state, as one private projection. */
export interface FriendSnapshot {
  readonly friends: ReadonlyArray<FriendRecord>;
  readonly incoming: ReadonlyArray<FriendRecord>;
  readonly outgoing: ReadonlyArray<FriendRecord>;
  readonly finderVisible: boolean;
}

export interface FriendOpFailure {
  readonly status: "failed";
  readonly reason: VipActionFailedReason;
}

export type FriendOpResult =
  | {
      readonly status: "ok";
      readonly snapshot: FriendSnapshot;
      /** The other party, when they should be told and re-projected. */
      readonly notify?: FriendRecord;
    }
  | FriendOpFailure;

/**
 * Durable reciprocal friendships and their requests. Every mutation
 * re-validates inside one transaction at execution time: the target name must
 * resolve, both caps are counted under the same transaction, and accepting
 * requires the request row to still exist — a client cannot accept a request
 * that was never sent, because the id it names is the server's own
 * (charter rules 1 and 4).
 */
export interface FriendStore {
  loadSnapshot(characterId: string): Promise<FriendSnapshot>;
  request(input: {
    characterId: string;
    targetName: string;
    maxRequests: number;
    maxFriends: number;
  }): Promise<FriendOpResult>;
  respond(input: {
    characterId: string;
    fromCharacterId: string;
    accept: boolean;
    maxFriends: number;
  }): Promise<FriendOpResult>;
  /** Ends a friendship (both halves) or withdraws an outgoing request. */
  remove(input: {
    characterId: string;
    targetCharacterId: string;
  }): Promise<FriendOpResult>;
  setFinderVisible(input: {
    characterId: string;
    finderVisible: boolean;
  }): Promise<FriendOpResult>;
}
