import type { MinimapMarker } from "@tibia/protocol";

/**
 * Durable per-character minimap markers. The tile is the key, so placing a
 * flag twice on the same tile replaces it instead of growing the list, and
 * the cap is re-counted inside the write at execution time.
 */
export interface MarkerStore {
  loadMarkers(characterId: string): Promise<ReadonlyArray<MinimapMarker>>;
  setMarker(input: {
    characterId: string;
    marker: MinimapMarker;
    maxMarkers: number;
  }): Promise<{ status: "ok" } | { status: "failed"; reason: "list-full" }>;
  deleteMarker(input: {
    characterId: string;
    position: { x: number; y: number; z: number };
  }): Promise<void>;
}
