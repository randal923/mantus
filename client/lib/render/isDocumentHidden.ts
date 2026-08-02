/**
 * True when the tab is backgrounded. Browsers freeze requestAnimationFrame
 * in hidden tabs, so the render tick that expires time-based visuals never
 * runs there — anything created while hidden would pile up until the player
 * returns. Guarded so node-environment unit tests see a visible document.
 */
export function isDocumentHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}
