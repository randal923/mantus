import type { Position } from "@tibia/protocol";
import type { PlaytestClient } from "./PlaytestClient";

/**
 * `/goto` a tile and prove the operator is standing on it. The command lands on
 * the nearest *free* tile and the player's own tile counts as occupied, so a
 * goto to the tile you already stand on quietly drops you beside it — which
 * makes any "now walk one step onto X" scenario test the wrong tile. The reply
 * carries the resulting position; retrying once always lands, because the first
 * attempt moved the player off the target. Returns null on success, otherwise
 * the reason to report.
 */
export async function gotoTile(
  client: PlaytestClient,
  target: Position,
  label: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const mark = client.mark();
    client.say(`/goto ${target.x} ${target.y} ${target.z}`);
    const reply = await client.waitFor(
      (message): message is Extract<typeof message, { type: "gm-response" }> =>
        message.type === "gm-response",
      `gm-response for goto ${label}`,
      { since: mark },
    );
    if (!reply.ok) return reply.text;
    const landed = /Position:\s*(\d+),\s*(\d+),\s*(\d+)/.exec(reply.text);
    if (
      landed &&
      Number(landed[1]) === target.x &&
      Number(landed[2]) === target.y &&
      Number(landed[3]) === target.z
    ) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return `could not stand on ${target.x},${target.y},${target.z}`;
}
