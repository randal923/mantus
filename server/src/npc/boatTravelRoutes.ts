import type { NpcTravelOffer } from "./DialogueGraph";

interface BoatTravelRouteOffer extends NpcTravelOffer {
  readonly label: string;
  readonly keywords?: ReadonlyArray<string>;
  readonly response?: string;
}

interface BoatTravelRouteDefinition {
  readonly typeId: string;
  readonly sourcePath: string;
  readonly offers: ReadonlyArray<BoatTravelRouteOffer>;
}

interface BoatTravelRouteContent {
  readonly canaryCommit: string;
  readonly definitions: ReadonlyArray<BoatTravelRouteDefinition>;
}

export const boatTravelRoutes: BoatTravelRouteContent = {
  canaryCommit: "a879c9312e34381e8eedf397b8ed44510698b689",
  definitions: [
    {
      typeId: "captain-breezelda",
      sourcePath: "data-otservbr-global/npc/captain_breezelda.lua",
      offers: [
        {
          id: "thais",
          label: "Thais",
          cost: 110,
          destination: { x: 32310, y: 32210, z: 6 },
        },
        {
          id: "carlin",
          label: "Carlin",
          cost: 180,
          destination: { x: 32387, y: 31820, z: 6 },
        },
        {
          id: "venore",
          label: "Venore",
          cost: 150,
          destination: { x: 32954, y: 32022, z: 6 },
        },
      ],
    },
    {
      typeId: "captain-fearless",
      sourcePath: "data-otservbr-global/npc/captain_fearless.lua",
      offers: [
        {
          id: "thais",
          label: "Thais",
          cost: 170,
          destination: { x: 32310, y: 32210, z: 6 },
        },
        {
          id: "krailos",
          label: "Krailos",
          cost: 185,
          destination: { x: 33493, y: 31712, z: 6 },
        },
        {
          id: "carlin",
          label: "Carlin",
          cost: 130,
          destination: { x: 32387, y: 31820, z: 6 },
        },
        {
          id: "gray-island",
          label: "Gray Island",
          keywords: ["gray island", "gray beach"],
          cost: 150,
          destination: { x: 33196, y: 31984, z: 7 },
        },
        {
          id: "abdendriel",
          label: "Ab'Dendriel",
          keywords: ["ab'dendriel", "abdendriel"],
          cost: 90,
          destination: { x: 32734, y: 31668, z: 6 },
        },
        {
          id: "edron",
          label: "Edron",
          cost: 40,
          destination: { x: 33173, y: 31764, z: 6 },
        },
        {
          id: "port-hope",
          label: "Port Hope",
          cost: 160,
          destination: { x: 32527, y: 32784, z: 6 },
        },
        {
          id: "svargrond",
          label: "Svargrond",
          cost: 150,
          destination: { x: 32341, y: 31108, z: 6 },
        },
        {
          id: "liberty-bay",
          label: "Liberty Bay",
          cost: 180,
          destination: { x: 32285, y: 32892, z: 6 },
        },
        {
          id: "ankrahmun",
          label: "Ankrahmun",
          cost: 150,
          destination: { x: 33092, y: 32883, z: 6 },
        },
        {
          id: "issavi",
          label: "Issavi",
          cost: 130,
          destination: { x: 33900, y: 31463, z: 6 },
        },
        {
          id: "darashia",
          label: "Darashia",
          response: "This route is haunted by a ghostship. Do you still seek a passage to Darashia for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33289, y: 32481, z: 6 },
          diversion: {
            oneIn: 10,
            destination: { x: 33324, y: 32173, z: 6 },
          },
        },
      ],
    },
    {
      typeId: "captain-greyhound",
      sourcePath: "data-otservbr-global/npc/captain_greyhound.lua",
      offers: [
        {
          id: "thais",
          label: "Thais",
          cost: 110,
          destination: { x: 32310, y: 32210, z: 6 },
        },
        {
          id: "abdendriel",
          label: "Ab'Dendriel",
          keywords: ["ab'dendriel", "abdendriel"],
          cost: 80,
          destination: { x: 32734, y: 31668, z: 6 },
        },
        {
          id: "edron",
          label: "Edron",
          cost: 110,
          destination: { x: 33175, y: 31764, z: 6 },
        },
        {
          id: "venore",
          label: "Venore",
          cost: 130,
          destination: { x: 32954, y: 32022, z: 6 },
        },
        {
          id: "svargrond",
          label: "Svargrond",
          cost: 110,
          destination: { x: 32341, y: 31108, z: 6 },
        },
      ],
    },
    {
      typeId: "captain-gulliver",
      sourcePath: "data-otservbr-global/npc/captain_gulliver.lua",
      offers: [
        {
          id: "thais",
          label: "Thais",
          cost: 150,
          destination: { x: 32311, y: 32210, z: 6 },
        },
        {
          id: "krailos",
          label: "Krailos",
          cost: 180,
          destination: { x: 33493, y: 31712, z: 6 },
        },
        {
          id: "issavi",
          label: "Issavi",
          cost: 130,
          destination: { x: 33902, y: 31462, z: 6 },
        },
      ],
    },
    {
      typeId: "captain-harava",
      sourcePath: "data-otservbr-global/npc/captain_harava.lua",
      offers: [
        {
          id: "darashia",
          label: "Darashia",
          cost: 80,
          destination: { x: 33289, y: 32481, z: 6 },
        },
        {
          id: "venore",
          label: "Venore",
          cost: 80,
          destination: { x: 32954, y: 32022, z: 6 },
        },
        {
          id: "oramond",
          label: "Oramond",
          cost: 100,
          destination: { x: 33479, y: 31985, z: 7 },
        },
        {
          id: "krailos",
          label: "Krailos",
          cost: 80,
          destination: { x: 33492, y: 31712, z: 6 },
        },
      ],
    },
    {
      typeId: "captain-pelagia",
      sourcePath: "data-otservbr-global/npc/captain_pelagia.lua",
      offers: [
        {
          id: "venore",
          label: "Venore",
          cost: 120,
          destination: { x: 32954, y: 32022, z: 6 },
        },
        {
          id: "edron",
          label: "Edron",
          cost: 110,
          destination: { x: 33176, y: 31765, z: 6 },
        },
        {
          id: "oramond",
          label: "Oramond",
          cost: 70,
          destination: { x: 33479, y: 31985, z: 7 },
        },
        {
          id: "darashia",
          label: "Darashia",
          cost: 120,
          destination: { x: 33289, y: 32481, z: 6 },
        },
        {
          id: "thais",
          label: "Thais",
          cost: 130,
          destination: { x: 32310, y: 32210, z: 6 },
        },
        {
          id: "issavi",
          label: "Issavi",
          cost: 130,
          destination: { x: 33902, y: 31464, z: 6 },
        },
      ],
    },
    {
      typeId: "captain-seagull",
      sourcePath: "data-otservbr-global/npc/captain_seagull.lua",
      offers: [
        {
          id: "thais",
          label: "Thais",
          cost: 130,
          destination: { x: 32310, y: 32210, z: 6 },
        },
        {
          id: "carlin",
          label: "Carlin",
          cost: 80,
          destination: { x: 32387, y: 31820, z: 6 },
        },
        {
          id: "gray-island",
          label: "Gray Island",
          keywords: ["gray island", "gray beach"],
          cost: 150,
          destination: { x: 33196, y: 31984, z: 7 },
        },
        {
          id: "edron",
          label: "Edron",
          cost: 70,
          destination: { x: 33175, y: 31764, z: 6 },
        },
        {
          id: "venore",
          label: "Venore",
          cost: 90,
          destination: { x: 32954, y: 32022, z: 6 },
        },
      ],
    },
    {
      typeId: "captain-seahorse",
      sourcePath: "data-otservbr-global/npc/captain_seahorse.lua",
      offers: [
        {
          id: "venore",
          label: "Venore",
          cost: 40,
          destination: { x: 32954, y: 32022, z: 6 },
        },
        {
          id: "thais",
          label: "Thais",
          cost: 160,
          destination: { x: 32310, y: 32210, z: 6 },
        },
        {
          id: "carlin",
          label: "Carlin",
          cost: 110,
          destination: { x: 32387, y: 31820, z: 6 },
        },
        {
          id: "krailos",
          label: "Krailos",
          cost: 185,
          destination: { x: 33493, y: 31712, z: 6 },
        },
        {
          id: "abdendriel",
          label: "Ab'Dendriel",
          keywords: ["ab'dendriel", "abdendriel"],
          cost: 70,
          destination: { x: 32734, y: 31668, z: 6 },
        },
        {
          id: "gray-island",
          label: "Gray Island",
          keywords: ["gray island", "gray beach"],
          cost: 190,
          destination: { x: 33196, y: 31984, z: 7 },
        },
        {
          id: "port-hope",
          label: "Port Hope",
          cost: 150,
          destination: { x: 32527, y: 32784, z: 6 },
        },
        {
          id: "liberty-bay",
          label: "Liberty Bay",
          cost: 170,
          destination: { x: 32285, y: 32892, z: 6 },
        },
        {
          id: "ankrahmun",
          label: "Ankrahmun",
          cost: 160,
          destination: { x: 33092, y: 32883, z: 6 },
        },
        {
          id: "cormaya",
          label: "Cormaya",
          cost: 20,
          destination: { x: 33288, y: 31956, z: 6 },
        },
        {
          id: "oramond",
          label: "Oramond",
          cost: 200,
          destination: { x: 33479, y: 31985, z: 7 },
        },
      ],
    },
    {
      typeId: "captain-sinbeard",
      sourcePath: "data-otservbr-global/npc/captain_sinbeard.lua",
      offers: [
        {
          id: "edron",
          label: "Edron",
          cost: 160,
          destination: { x: 33175, y: 31764, z: 6 },
        },
        {
          id: "venore",
          label: "Venore",
          cost: 150,
          destination: { x: 32954, y: 32022, z: 6 },
        },
        {
          id: "port-hope",
          label: "Port Hope",
          cost: 80,
          destination: { x: 32527, y: 32784, z: 6 },
        },
        {
          id: "liberty-bay",
          label: "Liberty Bay",
          cost: 90,
          destination: { x: 32285, y: 32892, z: 6 },
        },
        {
          id: "darashia",
          label: "Darashia",
          cost: 100,
          destination: { x: 33289, y: 32480, z: 6 },
        },
      ],
    },
    {
      typeId: "jack-fate",
      sourcePath: "data-otservbr-global/npc/jack_fate.lua",
      offers: [
        {
          id: "edron",
          label: "Edron",
          cost: 170,
          destination: { x: 33173, y: 31764, z: 6 },
        },
        {
          id: "venore",
          label: "Venore",
          cost: 180,
          destination: { x: 32954, y: 32022, z: 6 },
        },
        {
          id: "port-hope",
          label: "Port Hope",
          cost: 50,
          destination: { x: 32527, y: 32784, z: 6 },
        },
        {
          id: "darashia",
          label: "Darashia",
          cost: 200,
          destination: { x: 33289, y: 32480, z: 6 },
        },
        {
          id: "ankrahmun",
          label: "Ankrahmun",
          cost: 90,
          destination: { x: 33092, y: 32883, z: 6 },
        },
        {
          id: "thais",
          label: "Thais",
          response: "A tropical storm may drive us off course. Do you still seek a passage to Thais for |TRAVELCOST|?",
          cost: 180,
          destination: { x: 32310, y: 32210, z: 6 },
          diversion: {
            oneIn: 8,
            destination: { x: 32161, y: 32558, z: 6 },
          },
        },
      ],
    },
    {
      typeId: "petros",
      sourcePath: "data-otservbr-global/npc/petros.lua",
      offers: [
        {
          id: "venore",
          label: "Venore",
          cost: 180,
          destination: { x: 32954, y: 32022, z: 6 },
        },
        {
          id: "port-hope",
          label: "Port Hope",
          cost: 50,
          destination: { x: 32527, y: 32784, z: 6 },
        },
        {
          id: "liberty-bay",
          label: "Liberty Bay",
          cost: 140,
          destination: { x: 32285, y: 32892, z: 6 },
        },
        {
          id: "ankrahmun",
          label: "Ankrahmun",
          cost: 150,
          destination: { x: 33092, y: 32883, z: 6 },
        },
        {
          id: "gray-island",
          label: "Gray Island",
          keywords: ["gray island", "gray beach"],
          cost: 160,
          destination: { x: 33196, y: 31984, z: 7 },
        },
        {
          id: "krailos",
          label: "Krailos",
          cost: 200,
          destination: { x: 33493, y: 31712, z: 6 },
        },
        {
          id: "issavi",
          label: "Issavi",
          cost: 130,
          destination: { x: 33902, y: 31462, z: 6 },
        },
      ],
    },
    {
      typeId: "charles",
      sourcePath: "data-otservbr-global/npc/charles.lua",
      offers: [
        {
          id: "edron",
          label: "Edron",
          cost: 150,
          destination: { x: 33173, y: 31764, z: 6 },
        },
        {
          id: "venore",
          label: "Venore",
          cost: 160,
          destination: { x: 32954, y: 32022, z: 6 },
        },
        {
          id: "ankrahmun",
          label: "Ankrahmun",
          cost: 110,
          destination: { x: 33092, y: 32883, z: 6 },
        },
        {
          id: "darashia",
          label: "Darashia",
          cost: 180,
          destination: { x: 33289, y: 32480, z: 6 },
        },
        {
          id: "thais",
          label: "Thais",
          cost: 160,
          destination: { x: 32310, y: 32210, z: 6 },
        },
        {
          id: "liberty-bay",
          label: "Liberty Bay",
          cost: 50,
          destination: { x: 32285, y: 32892, z: 6 },
        },
        {
          id: "carlin",
          label: "Carlin",
          cost: 120,
          destination: { x: 32387, y: 31820, z: 6 },
        },
      ],
    },
    {
      typeId: "captain-cookie",
      sourcePath: "data-otservbr-global/npc/captain_cookie.lua",
      offers: [
        {
          id: "liberty-bay",
          label: "Liberty Bay",
          cost: 400,
          destination: { x: 32285, y: 32892, z: 6 },
        },
      ],
    },
    {
      typeId: "captain-chelop",
      sourcePath: "data-otservbr-global/npc/captain_chelop.lua",
      offers: [
        {
          id: "thais",
          label: "Thais",
          cost: 210,
          destination: { x: 32310, y: 32210, z: 6 },
        },
      ],
    },
    {
      typeId: "scrutinon",
      sourcePath: "data-otservbr-global/npc/scrutinon.lua",
      offers: [
        {
          id: "abdendriel",
          label: "Ab'Dendriel",
          keywords: ["ab'dendriel", "abdendriel"],
          cost: 0,
          destination: { x: 32734, y: 31668, z: 6 },
        },
        {
          id: "edron",
          label: "Edron",
          cost: 0,
          destination: { x: 33175, y: 31764, z: 6 },
        },
        {
          id: "venore",
          label: "Venore",
          cost: 0,
          destination: { x: 32954, y: 32022, z: 6 },
        },
        {
          id: "darashia",
          label: "Darashia",
          cost: 0,
          destination: { x: 33289, y: 32480, z: 6 },
        },
      ],
    },
  ],
};
