import type { CharacterOutfit, StarterVocation } from "@tibia/protocol";

export interface LandingVocationShowcase {
  vocation: StarterVocation;
  outfit: CharacterOutfit;
}

export const LANDING_VOCATION_SHOWCASE: ReadonlyArray<LandingVocationShowcase> =
  [
    {
      vocation: "Knight",
      outfit: { lookType: 128, head: 78, body: 94, legs: 39, feet: 95, addons: 0 },
    },
    {
      vocation: "Paladin",
      outfit: { lookType: 136, head: 78, body: 121, legs: 101, feet: 76, addons: 0 },
    },
    {
      vocation: "Sorcerer",
      outfit: { lookType: 128, head: 78, body: 88, legs: 87, feet: 76, addons: 0 },
    },
    {
      vocation: "Druid",
      outfit: { lookType: 136, head: 78, body: 68, legs: 121, feet: 58, addons: 0 },
    },
    {
      vocation: "Monk",
      outfit: { lookType: 128, head: 78, body: 77, legs: 96, feet: 96, addons: 0 },
    },
  ];
