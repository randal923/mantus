/**
 * Bare on/off lever type pairs (both directions). Levers whose map placement
 * carries an action or unique id are quest-scripted and stay fail-closed
 * until 20a-quest-state ships their effects.
 */
export const LEVER_TOGGLE_PAIRS: ReadonlyMap<number, number> = new Map([
  [2772, 2773],
  [2773, 2772],
  [9110, 9111],
  [9111, 9110],
]);
