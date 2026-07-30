/**
 * Serializes one character's login store reads onto a single pooled connection.
 *
 * World entry fans out ~20 per-character reads across the services that attach
 * in `CharacterHandler.enterWorld`. Issued concurrently — which is what
 * `void store.load(...)` in each `attachCharacter` did — every one of them
 * checks out its own pooled client, so a single login could saturate the whole
 * pool and starve character saves behind it. Chaining them per character keeps
 * the peak at one connection per login, the same shape Canary gets from its
 * single mutex-guarded MySQL handle, at the cost of paying the round trips
 * sequentially instead of in one wave.
 *
 * The chain is keyed by character, so concurrent logins still proceed in
 * parallel — this bounds one login's footprint, not the server's throughput.
 *
 * A load that rejects does not stall the ones queued behind it; callers keep
 * their own rejection handling, and every attach already drops a result whose
 * session has since been replaced.
 */
export class LoginLoadQueue {
  /** Never-rejecting tail per character, so a failed load cannot block it. */
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(characterId: string, load: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(characterId);
    // An idle chain starts its load immediately; a busy one queues behind the
    // tail. Going through a resolved promise instead would delay every login's
    // first read by a microtask for no reason.
    const result = previous ? previous.then(load) : LoginLoadQueue.start(load);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(characterId, tail);
    void tail.then(() => {
      if (this.tails.get(characterId) === tail) this.tails.delete(characterId);
    });
    return result;
  }

  /** Turns a synchronous throw from `load` into a rejection, like `then` does. */
  private static start<T>(load: () => Promise<T>): Promise<T> {
    try {
      return load();
    } catch (cause) {
      return Promise.reject(cause);
    }
  }
}
