/** Resolves on the next idle period (or shortly after, as a fallback). */
export function waitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 200 });
      return;
    }
    setTimeout(resolve, 25);
  });
}
