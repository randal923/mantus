import { expect, test } from "vitest";
import { createRoot } from "react-dom/client";
import { SpriteIcon } from "../components/inventory/SpriteIcon";

/**
 * Mounts the real SpriteIcon in a real browser against the real
 * /assets/item-animations.json and asserts multi-phase item icons actually
 * cycle sprites: an exercise sword (first sprite 25676, 5 phases) and a
 * supreme health potion (first sprite 23396, 12 phases) must show more than
 * one atlas cell over a second, while a static gold coin stays put.
 */
const EXERCISE_SWORD = { clientId: 28_552, spriteId: 25_676 };
const SUPREME_HEALTH_POTION = { clientId: 23_375, spriteId: 23_396 };
const GOLD_COIN = { clientId: 3_031, spriteId: 3_992 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function iconCell(container: HTMLElement): string {
  const inner = container.querySelector<HTMLElement>("[style*=background]");
  if (!inner) throw new Error("sprite icon inner element not found");
  return `${inner.style.backgroundImage} ${inner.style.backgroundPosition}`;
}

test("multi-phase item icons animate, static icons do not", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const sword = document.createElement("div");
  const potion = document.createElement("div");
  const coin = document.createElement("div");
  host.append(sword, potion, coin);
  createRoot(sword).render(
    <SpriteIcon
      spriteId={EXERCISE_SWORD.spriteId}
      clientId={EXERCISE_SWORD.clientId}
    />,
  );
  createRoot(potion).render(
    <SpriteIcon
      spriteId={SUPREME_HEALTH_POTION.spriteId}
      clientId={SUPREME_HEALTH_POTION.clientId}
    />,
  );
  createRoot(coin).render(
    <SpriteIcon spriteId={GOLD_COIN.spriteId} clientId={GOLD_COIN.clientId} />,
  );

  const swordCells = new Set<string>();
  const potionCells = new Set<string>();
  const coinCells = new Set<string>();
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (sword.firstChild) swordCells.add(iconCell(sword));
    if (potion.firstChild) potionCells.add(iconCell(potion));
    if (coin.firstChild) coinCells.add(iconCell(coin));
    await sleep(40);
  }

  expect(coinCells.size).toBe(1);
  expect(swordCells.size).toBeGreaterThanOrEqual(3);
  expect(potionCells.size).toBeGreaterThanOrEqual(4);
}, 30_000);
