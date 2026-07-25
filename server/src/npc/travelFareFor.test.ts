import { describe, expect, it } from "vitest";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import type { NpcTravelOffer } from "./DialogueGraph";
import { travelFareFor } from "./travelFareFor";

const makePlayer = (): Player =>
  new Player(makeCharacter("fare-player", "Fare Player"), {
    x: 1,
    y: 1,
    z: 7,
  });

const rankDiscount = (rank: number, cost: number) => ({
  cost,
  conditions: [
    {
      kind: "storage" as const,
      key: "Quest.Postman.Rank",
      operator: "gte" as const,
      value: rank,
    },
  ],
});

const offer: NpcTravelOffer = {
  id: "carlin",
  cost: 110,
  destination: { x: 2, y: 2, z: 7 },
  // Best first: the first matching entry wins.
  discounts: [rankDiscount(5, 0), rankDiscount(3, 10)],
};

describe("travelFareFor", () => {
  it("charges the listed fare without a matching discount", () => {
    expect(travelFareFor(offer, makePlayer(), null, 0)).toBe(110);
  });

  it("applies the first matching discount", () => {
    const player = makePlayer();
    player.setStorageValue("Quest.Postman.Rank", 3);
    expect(travelFareFor(offer, player, null, 0)).toBe(10);

    player.setStorageValue("Quest.Postman.Rank", 6);
    expect(travelFareFor(offer, player, null, 0)).toBe(0);
  });

  it("never lets a discount raise the fare", () => {
    const player = makePlayer();
    player.setStorageValue("Quest.Postman.Rank", 3);
    expect(
      travelFareFor(
        { ...offer, cost: 5, discounts: [rankDiscount(3, 999)] },
        player,
        null,
        0,
      ),
    ).toBe(5);
  });

  it("charges the listed fare when the offer has no discounts", () => {
    expect(
      travelFareFor(
        { id: "thais", cost: 60, destination: { x: 2, y: 2, z: 7 } },
        makePlayer(),
        null,
        0,
      ),
    ).toBe(60);
  });
});
