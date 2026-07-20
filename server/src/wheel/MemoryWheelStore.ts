import { WHEEL_LIMITS } from "@tibia/protocol";
import type { WheelStore } from "./WheelStore";

export class MemoryWheelStore implements WheelStore {
  private readonly slicesByCharacter = new Map<string, ReadonlyArray<number>>();

  async loadSlices(characterId: string): Promise<ReadonlyArray<number>> {
    return (
      this.slicesByCharacter.get(characterId) ??
      new Array<number>(WHEEL_LIMITS.sliceCount).fill(0)
    );
  }

  async saveSlices(
    characterId: string,
    slices: ReadonlyArray<number>,
  ): Promise<void> {
    this.slicesByCharacter.set(characterId, [...slices]);
  }
}
