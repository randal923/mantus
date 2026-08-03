/**
 * Whether a store failure means the row simply is not there — the message both
 * `PgItemLocks.lockItem` and `MemoryItemStore` throw when an id resolves to no
 * row. Unlike a serialization abort or a lost connection, this one can never
 * succeed on a retry: the caller is holding an id the database does not know.
 */
export function isItemNotFoundError(cause: unknown): boolean {
  return cause instanceof Error && cause.message === "item not found";
}
