/** Live numbers the game server hands the status listener on each query. */
export interface StatusSnapshot {
  uptimeSeconds: number;
  playersOnline: number;
  /** Distinct client addresses among the players online (otservlist's `unique`). */
  uniqueAddresses: number;
  maxPlayers: number;
  peakPlayers: number;
  monsters: number;
  npcs: number;
  rates: {
    experience: number;
    skill: number;
    loot: number;
    magic: number;
    spawn: number;
  };
  mapName: string;
}
