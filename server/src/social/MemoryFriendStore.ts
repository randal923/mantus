import type {
  FriendOpResult,
  FriendRecord,
  FriendSnapshot,
  FriendStore,
} from "./FriendStore";

/**
 * In-memory FriendStore mirroring the Pg store's execution-time re-checks:
 * both halves of a friendship are written together, an accept requires the
 * request row to exist, and crossing requests settle immediately.
 */
export class MemoryFriendStore implements FriendStore {
  private readonly names = new Map<string, string>();
  private readonly friends = new Map<string, Set<string>>();
  /** requester -> recipients. */
  private readonly requests = new Map<string, Set<string>>();
  private readonly finderVisible = new Map<string, boolean>();

  registerCharacter(characterId: string, name: string): void {
    this.names.set(characterId, name);
  }

  async loadSnapshot(characterId: string): Promise<FriendSnapshot> {
    return this.snapshotOf(characterId);
  }

  async request(input: {
    characterId: string;
    targetName: string;
    maxRequests: number;
    maxFriends: number;
  }): Promise<FriendOpResult> {
    const target = [...this.names.entries()].find(
      ([, name]) =>
        name.trim().toLowerCase() === input.targetName.trim().toLowerCase(),
    );
    if (!target) return { status: "failed", reason: "not-found" };
    const [targetId, targetName] = target;
    if (targetId === input.characterId) {
      return { status: "failed", reason: "cannot-add-self" };
    }
    if (this.friends.get(input.characterId)?.has(targetId)) {
      return { status: "failed", reason: "already-friends" };
    }
    const outgoing = this.requests.get(input.characterId) ?? new Set<string>();
    if (outgoing.size >= input.maxRequests) {
      return { status: "failed", reason: "list-full" };
    }
    if ((this.friends.get(input.characterId)?.size ?? 0) >= input.maxFriends) {
      return { status: "failed", reason: "list-full" };
    }
    const notify: FriendRecord = { characterId: targetId, name: targetName };
    const crossing = this.requests.get(targetId);
    if (crossing?.has(input.characterId)) {
      crossing.delete(input.characterId);
      this.link(input.characterId, targetId);
      return {
        status: "ok",
        snapshot: this.snapshotOf(input.characterId),
        notify,
      };
    }
    if (outgoing.has(targetId)) {
      return { status: "failed", reason: "request-pending" };
    }
    outgoing.add(targetId);
    this.requests.set(input.characterId, outgoing);
    return {
      status: "ok",
      snapshot: this.snapshotOf(input.characterId),
      notify,
    };
  }

  async respond(input: {
    characterId: string;
    fromCharacterId: string;
    accept: boolean;
    maxFriends: number;
  }): Promise<FriendOpResult> {
    const pending = this.requests.get(input.fromCharacterId);
    if (!pending?.has(input.characterId)) {
      return { status: "failed", reason: "request-not-found" };
    }
    pending.delete(input.characterId);
    if (input.accept) {
      for (const id of [input.characterId, input.fromCharacterId]) {
        if ((this.friends.get(id)?.size ?? 0) >= input.maxFriends) {
          return { status: "failed", reason: "list-full" };
        }
      }
      this.link(input.characterId, input.fromCharacterId);
    }
    return {
      status: "ok",
      snapshot: this.snapshotOf(input.characterId),
      notify: {
        characterId: input.fromCharacterId,
        name: this.names.get(input.fromCharacterId) ?? "?",
      },
    };
  }

  async remove(input: {
    characterId: string;
    targetCharacterId: string;
  }): Promise<FriendOpResult> {
    const hadFriend =
      this.friends.get(input.characterId)?.delete(input.targetCharacterId) ??
      false;
    this.friends.get(input.targetCharacterId)?.delete(input.characterId);
    const hadRequest =
      this.requests.get(input.characterId)?.delete(input.targetCharacterId) ??
      false;
    if (!hadFriend && !hadRequest) {
      return { status: "failed", reason: "not-found" };
    }
    return {
      status: "ok",
      snapshot: this.snapshotOf(input.characterId),
      notify: {
        characterId: input.targetCharacterId,
        name: this.names.get(input.targetCharacterId) ?? "?",
      },
    };
  }

  async setFinderVisible(input: {
    characterId: string;
    finderVisible: boolean;
  }): Promise<FriendOpResult> {
    this.finderVisible.set(input.characterId, input.finderVisible);
    return { status: "ok", snapshot: this.snapshotOf(input.characterId) };
  }

  private link(a: string, b: string): void {
    const left = this.friends.get(a) ?? new Set<string>();
    left.add(b);
    this.friends.set(a, left);
    const right = this.friends.get(b) ?? new Set<string>();
    right.add(a);
    this.friends.set(b, right);
  }

  private snapshotOf(characterId: string): FriendSnapshot {
    const records = (ids: Iterable<string>): FriendRecord[] =>
      [...ids]
        .map((id) => ({ characterId: id, name: this.names.get(id) ?? "?" }))
        .sort((left, right) => left.name.localeCompare(right.name));
    const incoming: string[] = [];
    for (const [from, recipients] of this.requests) {
      if (recipients.has(characterId)) incoming.push(from);
    }
    return {
      friends: records(this.friends.get(characterId) ?? []),
      incoming: records(incoming),
      outgoing: records(this.requests.get(characterId) ?? []),
      finderVisible: this.finderVisible.get(characterId) ?? true,
    };
  }
}
