import type { DialogueCondition, NpcTravelOffer } from "./DialogueGraph";

/**
 * The Farmine ride opens only once The New Frontier's tenth mission is
 * finished; before that every pilot answers "Never heard about a place like
 * this." The Canary sources spell the gate as `getStorageValue(...) ~= 2`
 * guarding the refusal, so the route itself wants the value to be exactly 2.
 */
const NEW_FRONTIER_MISSION_10: ReadonlyArray<DialogueCondition> = [
  {
    kind: "storage",
    key: "Quest.U8_54.TheNewFrontier.Mission10",
    operator: "eq",
    value: 2,
  },
];

interface CarpetTravelRouteOffer extends NpcTravelOffer {
  readonly label: string;
  /** Every keyword Canary registers for the route, aliases included. */
  readonly keywords: ReadonlyArray<string>;
  /** The prompt Canary renders; `|TRAVELCOST|` is priced server-side. */
  readonly response: string;
}

interface CarpetTravelRouteDefinition {
  readonly typeId: string;
  readonly sourcePath: string;
  /** `StdModule.travel`'s line, which defaults to "Set the sails!". */
  readonly confirmResponse: string;
  readonly declineResponse: string;
  readonly offers: ReadonlyArray<CarpetTravelRouteOffer>;
}

interface CarpetTravelRouteContent {
  readonly canaryCommit: string;
  readonly definitions: ReadonlyArray<CarpetTravelRouteDefinition>;
}

/**
 * The magic-carpet network. Every pilot registers its rides through a
 * file-local `addTravelKeyword` helper, which the NPC importer cannot read —
 * it only sees `keywordHandler:addKeyword` calls written at the top level —
 * so the imported graphs arrive with the pilot's "I can fly you to ..." line
 * and no routes behind it. These definitions carry the dropped rides;
 * `withCarpetTravelRoutes` grafts them onto the imported dialogue.
 *
 * Gated routes (`conditions`) are carried through to the offer as well as the
 * branch, so `TravelService` re-checks the gate when it charges the fare and
 * listing a route never authorizes it.
 */
export const carpetTravelRoutes: CarpetTravelRouteContent = {
  canaryCommit: "a879c9312e34381e8eedf397b8ed44510698b689",
  definitions: [
    {
      typeId: "chemar",
      sourcePath: "data-otservbr-global/npc/chemar.lua",
      confirmResponse: "Hold on!",
      declineResponse: "You shouldn't miss the experience.",
      offers: [
        {
          id: "edron",
          label: "Edron",
          keywords: ["edron"],
          response: "Do you seek a ride to Edron for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33193, y: 31784, z: 3 },
        },
        {
          id: "svargrond",
          label: "Svargrond",
          keywords: ["svargrond"],
          response: "Do you seek a ride to Svargrond for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32253, y: 31097, z: 4 },
        },
        {
          id: "femor-hills",
          label: "Femor Hills",
          keywords: ["femor hills", "hills"],
          response: "Do you seek a ride to Femor Hills for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32536, y: 31837, z: 4 },
        },
        {
          id: "kazordoon",
          label: "Kazordoon",
          keywords: ["kazordoon", "kazor"],
          response: "Do you seek a ride to Kazordoon for |TRAVELCOST|?",
          cost: 80,
          destination: { x: 32588, y: 31941, z: 0 },
        },
        {
          id: "issavi",
          label: "Issavi",
          keywords: ["issavi"],
          response: "Do you seek a ride to Issavi for |TRAVELCOST|?",
          cost: 100,
          destination: { x: 33957, y: 31515, z: 0 },
        },
        {
          id: "marapur",
          label: "Marapur",
          keywords: ["marapur"],
          response: "Do you seek a ride to Marapur for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 33805, y: 32767, z: 2 },
        },
        {
          id: "farmine",
          label: "Farmine",
          keywords: ["farmine", "zao"],
          response: "Do you seek a ride to Farmine for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32983, y: 31539, z: 1 },
          conditions: NEW_FRONTIER_MISSION_10,
        },
      ],
    },
    {
      typeId: "gewen",
      sourcePath: "data-otservbr-global/npc/gewen.lua",
      confirmResponse: "Hold on!",
      declineResponse: "You shouldn't miss the experience.",
      offers: [
        {
          id: "darashia",
          label: "Darashia",
          keywords: ["darashia"],
          response:
            "Do you seek a ride to Darashia on Darama for |TRAVELCOST|?",
          cost: 40,
          destination: { x: 33270, y: 32441, z: 6 },
        },
        {
          id: "svargrond",
          label: "Svargrond",
          keywords: ["svargrond"],
          response: "Do you seek a ride to Svargrond for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32253, y: 31097, z: 4 },
        },
        {
          id: "femor-hills",
          label: "Femor Hills",
          keywords: ["femor hills", "hills"],
          response: "Do you seek a ride to the Femor Hills for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32536, y: 31837, z: 4 },
        },
        {
          id: "edron",
          label: "Edron",
          keywords: ["edron"],
          response: "Do you seek a ride to Edron for |TRAVELCOST|?",
          cost: 40,
          destination: { x: 33193, y: 31784, z: 3 },
        },
        {
          id: "issavi",
          label: "Issavi",
          keywords: ["issavi"],
          response: "Do you seek a ride to Issavi for |TRAVELCOST|?",
          cost: 100,
          destination: { x: 33957, y: 31515, z: 0 },
        },
        {
          id: "marapur",
          label: "Marapur",
          keywords: ["marapur"],
          response: "Do you seek a ride to Marapur for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 33805, y: 32767, z: 2 },
        },
        {
          id: "farmine",
          label: "Farmine",
          keywords: ["farmine", "zao"],
          response: "Do you seek a ride to Farmine for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32983, y: 31539, z: 1 },
          conditions: NEW_FRONTIER_MISSION_10,
        },
      ],
    },
    {
      typeId: "pino",
      sourcePath: "data-otservbr-global/npc/pino.lua",
      confirmResponse: "Hold on!",
      declineResponse: "You shouldn't miss the experience.",
      offers: [
        {
          id: "darashia",
          label: "Darashia",
          keywords: ["darashia", "darama"],
          response:
            "Do you seek a ride to Darashia on Darama for |TRAVELCOST|?",
          cost: 40,
          destination: { x: 33270, y: 32441, z: 6 },
        },
        {
          id: "kazordoon",
          label: "Kazordoon",
          keywords: ["kazordoon", "kazor"],
          response: "Do you seek a ride to Kazordoon for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 32588, y: 31941, z: 0 },
        },
        {
          id: "femor-hills",
          label: "Femor Hills",
          keywords: ["femor hills", "hills"],
          response: "Do you seek a ride to the Femor Hills for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32536, y: 31837, z: 4 },
        },
        {
          id: "svargrond",
          label: "Svargrond",
          keywords: ["svargrond"],
          response: "Do you seek a ride to Svargrond for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32253, y: 31097, z: 4 },
        },
        {
          id: "issavi",
          label: "Issavi",
          keywords: ["issavi"],
          response: "Do you seek a ride to Issavi for |TRAVELCOST|?",
          cost: 100,
          destination: { x: 33957, y: 31515, z: 0 },
        },
        {
          id: "marapur",
          label: "Marapur",
          keywords: ["marapur"],
          response: "Do you seek a ride to Marapur for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 33805, y: 32767, z: 2 },
        },
        {
          id: "farmine",
          label: "Farmine",
          keywords: ["farmine", "zao"],
          response: "Do you seek a ride to Farmine for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32983, y: 31539, z: 1 },
          conditions: NEW_FRONTIER_MISSION_10,
        },
      ],
    },
    {
      typeId: "melian",
      sourcePath: "data-otservbr-global/npc/melian.lua",
      // Melian's helper omits `text` on StdModule.travel, so Canary falls
      // back to its default line.
      confirmResponse: "Set the sails!",
      declineResponse: "You shouldn't miss the experience.",
      offers: [
        {
          id: "darashia",
          label: "Darashia",
          keywords: ["darashia", "darama"],
          response:
            "Do you seek a ride to Darashia on Darama for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33270, y: 32441, z: 6 },
        },
        {
          id: "svargrond",
          label: "Svargrond",
          keywords: ["svargrond"],
          response: "Do you seek a ride to Svargrond for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32253, y: 31097, z: 4 },
        },
        {
          id: "femor-hills",
          label: "Femor Hills",
          keywords: ["femor hills", "hills"],
          response: "Do you seek a ride to the Femor Hills for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32536, y: 31837, z: 4 },
        },
        {
          id: "edron",
          label: "Edron",
          keywords: ["edron"],
          response: "Do you seek a ride to Edron for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33193, y: 31784, z: 3 },
        },
        {
          id: "kazordoon",
          label: "Kazordoon",
          keywords: ["kazordoon", "kazor"],
          response: "Do you seek a ride to Kazordoon for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 32588, y: 31941, z: 0 },
        },
        {
          id: "issavi",
          label: "Issavi",
          keywords: ["issavi"],
          response: "Do you seek a ride to Issavi for |TRAVELCOST|?",
          cost: 100,
          destination: { x: 33957, y: 31515, z: 0 },
        },
        {
          id: "marapur",
          label: "Marapur",
          keywords: ["marapur"],
          response: "Do you seek a ride to Marapur for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 33805, y: 32767, z: 2 },
        },
      ],
    },
    {
      typeId: "iyad",
      sourcePath: "data-otservbr-global/npc/iyad.lua",
      confirmResponse: "Hold on!",
      declineResponse: "You shouldn't miss the experience.",
      offers: [
        {
          id: "darashia",
          label: "Darashia",
          keywords: ["darashia", "darama"],
          response:
            "Do you seek a ride to Darashia on Darama for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33270, y: 32441, z: 6 },
        },
        {
          id: "kazordoon",
          label: "Kazordoon",
          keywords: ["kazordoon", "kazor"],
          response: "Do you seek a ride to Kazordoon for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 32588, y: 31941, z: 0 },
        },
        {
          id: "femor-hills",
          label: "Femor Hills",
          keywords: ["femor hills", "hills"],
          response: "Do you seek a ride to the Femor Hills for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32536, y: 31837, z: 4 },
        },
        {
          id: "edron",
          label: "Edron",
          keywords: ["edron"],
          response: "Do you seek a ride to Edron for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33193, y: 31784, z: 3 },
        },
        {
          id: "issavi",
          label: "Issavi",
          keywords: ["issavi"],
          response: "Do you seek a ride to Issavi for |TRAVELCOST|?",
          cost: 100,
          destination: { x: 33957, y: 31515, z: 0 },
        },
        {
          id: "marapur",
          label: "Marapur",
          keywords: ["marapur"],
          response: "Do you seek a ride to Marapur for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 33805, y: 32767, z: 2 },
        },
        {
          id: "farmine",
          label: "Farmine",
          keywords: ["farmine", "zao"],
          response: "Do you seek a ride to Farmine for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32983, y: 31539, z: 1 },
          conditions: NEW_FRONTIER_MISSION_10,
        },
      ],
    },
    {
      typeId: "ziyad",
      sourcePath: "data-otservbr-global/npc/ziyad.lua",
      confirmResponse: "Set the sails!",
      declineResponse: "We would like to serve you some time.",
      offers: [
        {
          id: "darashia",
          label: "Darashia",
          keywords: ["darashia", "darama"],
          response: "Do you seek a passage to Darashia for |TRAVELCOST|?",
          cost: 40,
          destination: { x: 33270, y: 32441, z: 6 },
        },
        {
          id: "kazordoon",
          label: "Kazordoon",
          keywords: ["kazordoon", "kazor"],
          response: "Do you seek a passage to Kazordoon for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 32588, y: 31941, z: 0 },
        },
        {
          id: "femor-hills",
          label: "Femor Hills",
          keywords: ["femor hills", "hills"],
          response: "Do you seek a passage to Femor Hills for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32536, y: 31837, z: 4 },
        },
        {
          id: "svargrond",
          label: "Svargrond",
          keywords: ["svargrond"],
          response: "Do you seek a passage to Svargrond for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32253, y: 31097, z: 4 },
        },
        {
          id: "edron",
          label: "Edron",
          keywords: ["edron"],
          response: "Do you seek a passage to Edron for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33193, y: 31784, z: 3 },
        },
        {
          id: "issavi",
          label: "Issavi",
          keywords: ["issavi"],
          response: "Do you seek a passage to Issavi for |TRAVELCOST|?",
          cost: 100,
          destination: { x: 33957, y: 31515, z: 0 },
        },
        {
          id: "farmine",
          label: "Farmine",
          keywords: ["farmine", "zao"],
          response: "Do you seek a passage to Farmine for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32983, y: 31539, z: 1 },
          conditions: NEW_FRONTIER_MISSION_10,
        },
      ],
    },
    {
      typeId: "tanyt",
      sourcePath: "data-otservbr-global/npc/tanyt.lua",
      confirmResponse: "Set the sails!",
      declineResponse: "We would like to serve you some time.",
      offers: [
        {
          id: "darashia",
          label: "Darashia",
          keywords: ["darashia", "darama"],
          response: "Do you seek a passage to Darashia for |TRAVELCOST|?",
          cost: 40,
          destination: { x: 33270, y: 32441, z: 6 },
        },
        {
          id: "kazordoon",
          label: "Kazordoon",
          keywords: ["kazordoon", "kazor"],
          response: "Do you seek a passage to Kazordoon for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 32588, y: 31941, z: 0 },
        },
        {
          id: "femor-hills",
          label: "Femor Hills",
          keywords: ["femor hills", "hills"],
          response: "Do you seek a passage to Femor Hills for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32536, y: 31837, z: 4 },
        },
        {
          id: "svargrond",
          label: "Svargrond",
          keywords: ["svargrond"],
          response: "Do you seek a passage to Svargrond for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32253, y: 31097, z: 4 },
        },
        {
          id: "edron",
          label: "Edron",
          keywords: ["edron"],
          response: "Do you seek a passage to Edron for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33193, y: 31784, z: 3 },
        },
        {
          id: "marapur",
          label: "Marapur",
          keywords: ["marapur"],
          response: "Do you seek a passage to Marapur for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 33805, y: 32767, z: 2 },
        },
        {
          id: "farmine",
          label: "Farmine",
          keywords: ["farmine", "zao"],
          response: "Do you seek a passage to Farmine for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32983, y: 31539, z: 1 },
          conditions: NEW_FRONTIER_MISSION_10,
        },
      ],
    },
    {
      typeId: "uzon",
      sourcePath: "data-otservbr-global/npc/uzon.lua",
      confirmResponse: "Hold on!",
      declineResponse: "You shouldn't miss the experience.",
      offers: [
        {
          id: "darashia",
          label: "Darashia",
          keywords: ["darashia", "darama"],
          response:
            "Do you seek a ride to Darashia on Darama for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33270, y: 32441, z: 6 },
        },
        {
          id: "svargrond",
          label: "Svargrond",
          keywords: ["svargrond"],
          response: "Do you seek a ride to Svargrond for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32253, y: 31097, z: 4 },
        },
        {
          id: "kazordoon",
          label: "Kazordoon",
          keywords: ["kazordoon", "kazor"],
          response: "Do you seek a ride to Kazordoon for |TRAVELCOST|?",
          cost: 70,
          destination: { x: 32588, y: 31942, z: 0 },
        },
        {
          id: "edron",
          label: "Edron",
          keywords: ["edron"],
          response: "Do you seek a ride to Edron for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 33193, y: 31783, z: 3 },
        },
        {
          id: "issavi",
          label: "Issavi",
          keywords: ["issavi"],
          response: "Do you seek a ride to Issavi for |TRAVELCOST|?",
          cost: 100,
          destination: { x: 33957, y: 31515, z: 0 },
        },
        {
          id: "farmine",
          label: "Farmine",
          keywords: ["farmine", "zao"],
          response: "Do you seek a ride to Farmine for |TRAVELCOST|?",
          cost: 60,
          destination: { x: 32983, y: 31539, z: 1 },
          conditions: NEW_FRONTIER_MISSION_10,
        },
        {
          id: "eclipse",
          label: "Eclipse",
          keywords: ["eclipse"],
          response:
            "Oh no, so the time has come? Do you really want me to fly you to this unholy place?",
          cost: 110,
          destination: { x: 32659, y: 31915, z: 0 },
          // The source refuses unless the questline sits on 4 or 5; an
          // inclusive pair of bounds is that disjunction over an integer
          // storage value.
          conditions: [
            {
              kind: "storage",
              key: "Quest.U8_2.TheInquisitionQuest.Questline",
              operator: "gte",
              value: 4,
            },
            {
              kind: "storage",
              key: "Quest.U8_2.TheInquisitionQuest.Questline",
              operator: "lte",
              value: 5,
            },
          ],
        },
      ],
    },
    {
      typeId: "uzon-back",
      sourcePath: "data-otservbr-global/npc/uzon_back.lua",
      confirmResponse: "Hold on!",
      declineResponse: "You shouldn't miss the experience.",
      offers: [
        {
          id: "femor-hills",
          label: "Passage",
          keywords: ["passage"],
          response: "Can we finally leave this cursed place?",
          cost: 60,
          destination: { x: 32535, y: 31837, z: 4 },
        },
      ],
    },
  ],
};
