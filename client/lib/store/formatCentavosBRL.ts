export function formatCentavosBRL(centavos: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}
