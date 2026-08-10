/** Maps the settings slider's 0-100% to the lightmap's 0-255 ambient floor. */
export function minimumAmbientLevelFromPercent(percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent));
  return Math.round((clamped / 100) * 255);
}
