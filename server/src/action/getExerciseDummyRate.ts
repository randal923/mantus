/**
 * Exercise dummies and their items.xml `rate`, the same table Canary exposes
 * through `Game.getDummies()`. The rate scales every training tick: 100 is the
 * free dummy, 110 the house (Ferumbras/demon/monk) dummies.
 */
const DUMMY_RATES: ReadonlyMap<number, number> = new Map([
  [28558, 100],
  [28559, 110],
  [28560, 110],
  [28561, 110],
  [28562, 110],
  [28563, 110],
  [28564, 110],
  [28565, 100],
]);

export function getExerciseDummyRate(typeId: number): number | undefined {
  return DUMMY_RATES.get(typeId);
}
