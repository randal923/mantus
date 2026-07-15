import { fileURLToPath } from "node:url";
import type { MapConfig } from "./config";
import { gridMapData } from "./gridMapData";
import { loadMapData } from "./loadMapData";
import type { MapData } from "./MapData";

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));

export function resolveMapData(config: MapConfig): MapData {
  if (config.source === "grid") return gridMapData(config);
  return loadMapData(DATA_DIR, config.name, config.spawnTown);
}
