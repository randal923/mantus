"use client";

import type {
  CharacterOutfit,
  CharacterVocation,
  StarterVocation,
} from "@tibia/protocol";
import { PublicSiteLayout } from "./PublicSiteLayout";
import { VocationGuideCard } from "./VocationGuideCard";

const VOCATION_GUIDES: ReadonlyArray<{
  readonly outfit: CharacterOutfit;
  readonly promotion: CharacterVocation;
  readonly vocation: StarterVocation;
}> = [
  {
    vocation: "Knight",
    promotion: "Elite Knight",
    outfit: {
      lookType: 128,
      head: 78,
      body: 94,
      legs: 39,
      feet: 95,
      addons: 0,
    },
  },
  {
    vocation: "Paladin",
    promotion: "Royal Paladin",
    outfit: {
      lookType: 136,
      head: 78,
      body: 121,
      legs: 101,
      feet: 76,
      addons: 0,
    },
  },
  {
    vocation: "Sorcerer",
    promotion: "Master Sorcerer",
    outfit: {
      lookType: 128,
      head: 78,
      body: 88,
      legs: 87,
      feet: 76,
      addons: 0,
    },
  },
  {
    vocation: "Druid",
    promotion: "Elder Druid",
    outfit: {
      lookType: 136,
      head: 78,
      body: 68,
      legs: 121,
      feet: 58,
      addons: 0,
    },
  },
  {
    vocation: "Monk",
    promotion: "Exalted Monk",
    outfit: {
      lookType: 128,
      head: 78,
      body: 77,
      legs: 96,
      feet: 96,
      addons: 0,
    },
  },
];

export function VocationsPage() {
  return (
    <PublicSiteLayout>
      <div className="grid gap-5">
        {VOCATION_GUIDES.map((guide) => (
          <VocationGuideCard
            key={guide.vocation}
            vocation={guide.vocation}
            promotion={guide.promotion}
            outfit={guide.outfit}
          />
        ))}
      </div>
    </PublicSiteLayout>
  );
}
