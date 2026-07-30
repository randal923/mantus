/** Canary `formatNumber`: thousands grouped, locale-independent. */
function grouped(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface HouseLookState {
  readonly name: string;
  readonly size: number;
  readonly price: number;
  readonly rent: number;
  /** Null while the house is unowned. */
  readonly ownerName: string | null;
  readonly rentPeriodDays: number;
}

/**
 * Canary `House::updateDoorDescription`, the text it stamps onto every door of
 * a house so a look at one reads the ownership out. Ownership is public in
 * Tibia, so nothing here is hidden state.
 */
export function houseLookDescription(state: HouseLookState): string {
  const ownership = state.ownerName
    ? `${state.ownerName} owns this house.`
    : "Nobody owns this house.";
  const parts = [
    `It belongs to house '${state.name}'. ${ownership}`,
    `It is ${state.size} square meters.`,
  ];
  // Canary hides the price of a house somebody already owns.
  if (!state.ownerName) parts.push(`It costs ${grouped(state.price)} gold coins.`);
  parts.push(
    `The rent cost is ${grouped(state.rent)} gold coins and it is billed every ${state.rentPeriodDays} days.`,
  );
  return parts.join(" ");
}
