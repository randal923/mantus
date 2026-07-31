/**
 * Path to an imbuement's icon. The ids are the ones the server sends, which
 * are Canary's `iconid + (baseid - 1)` — so each power level has its own art —
 * and they index the sheet imported by `yarn imbuing:assets`. Icon 0 is the
 * placeholder Tibia draws in an empty slot.
 */
export function imbuementIconSrc(iconId: number): string {
  const bounded = Number.isInteger(iconId) && iconId > 0 ? iconId : 0;
  return `/assets/imbuing/icons/${bounded}.png`;
}
