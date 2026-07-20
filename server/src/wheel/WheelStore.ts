export interface WheelStore {
  /** Returns the 36-slice allocation, or all zeros when none is stored. */
  loadSlices(characterId: string): Promise<ReadonlyArray<number>>;
  saveSlices(
    characterId: string,
    slices: ReadonlyArray<number>,
  ): Promise<void>;
}
