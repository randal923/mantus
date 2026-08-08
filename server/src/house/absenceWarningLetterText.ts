import type { HouseInfo } from "./HouseInfo";

/**
 * The stamped letter mailed once per absence episode when the owner has been
 * offline past the warning threshold. Wording mirrors the rent warning; the
 * days left already reflect the owner's premium tier at scan time.
 */
export function absenceWarningLetterText(
  info: HouseInfo,
  daysLeft: number,
): string {
  return (
    `Warning! \nYou have not logged in for a while. Your house ` +
    `"${info.name}" will be repossessed unless you log in within ` +
    `${daysLeft} day(s).`
  );
}
