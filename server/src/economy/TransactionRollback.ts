/**
 * Thrown inside a store transaction to abort every mutation while still
 * returning a clean expected-failure result to the caller. The store's
 * transaction helper rolls back and returns `result` instead of rethrowing.
 */
export class TransactionRollback<T> extends Error {
  constructor(readonly result: T) {
    super("transaction rolled back with an expected failure");
  }
}
