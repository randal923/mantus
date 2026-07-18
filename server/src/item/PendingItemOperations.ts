/** In-flight item store operations keyed by character/item/event id. */
export class PendingItemOperations {
  private readonly operations = new Map<string, Promise<void>>();

  get(key: string): Promise<void> | undefined {
    return this.operations.get(key);
  }

  has(key: string): boolean {
    return this.operations.has(key);
  }

  track(key: string, operation: Promise<void>): void {
    this.operations.set(key, operation);
    void operation.finally(() => {
      if (this.operations.get(key) === operation) {
        this.operations.delete(key);
      }
    });
  }

  trackSwallowingErrors(key: string, operation: Promise<void>): void {
    this.operations.set(key, operation);
    void operation
      .finally(() => {
        if (this.operations.get(key) === operation) {
          this.operations.delete(key);
        }
      })
      .catch(() => undefined);
  }
}
