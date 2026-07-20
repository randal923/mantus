import type { Pool } from "pg";
import { WHEEL_LIMITS, WHEEL_SLICES } from "@tibia/protocol";
import { selectWheelSlicesQuery } from "./sql/selectWheelSlicesQuery";
import { upsertWheelSlicesQuery } from "./sql/upsertWheelSlicesQuery";
import type { WheelStore } from "./WheelStore";

export class PgWheelStore implements WheelStore {
  constructor(private readonly pool: Pool) {}

  async loadSlices(characterId: string): Promise<ReadonlyArray<number>> {
    const result = await this.pool.query<{ slices: number[] }>(
      selectWheelSlicesQuery,
      [characterId],
    );
    const stored = result.rows[0]?.slices;
    if (!stored || stored.length !== WHEEL_LIMITS.sliceCount) {
      return new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);
    }
    // Defensive re-check of the DB constraints; a bad row degrades to an
    // empty wheel instead of poisoning login-time stat derivation.
    const valid = stored.every((points, index) => {
      const definition = WHEEL_SLICES[index];
      return (
        definition !== undefined &&
        Number.isInteger(points) &&
        points >= 0 &&
        points <= definition.maxPoints
      );
    });
    if (!valid) {
      return new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);
    }
    return stored;
  }

  async saveSlices(
    characterId: string,
    slices: ReadonlyArray<number>,
  ): Promise<void> {
    if (slices.length !== WHEEL_LIMITS.sliceCount) {
      throw new Error("wheel slice count mismatch");
    }
    await this.pool.query(upsertWheelSlicesQuery, [characterId, [...slices]]);
  }
}
