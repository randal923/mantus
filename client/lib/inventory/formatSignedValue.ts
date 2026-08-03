/** Renders a delta with an explicit sign, e.g. 80 -> "+80", -5 -> "-5". */
export function formatSignedValue(value: number, locale?: string): string {
  const formatted = Math.abs(value).toLocaleString(locale);
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}
