import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { OwnCharacterState } from "@tibia/protocol";
import { fn } from "storybook/test";

import { GameHud } from "../components/GameHud";

const meta = {
  title: "GameHud",
  component: GameHud,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    battleListVisible: true,
    minimapVisible: false,
    mapName: null,
    minimapLayout: null,
    onMinimapLayoutChange: fn(),
    visibleCreatures: [],
    ownCharacter: {
      id: "player",
      vocation: "Knight",
      level: 20,
      health: 225,
      maxHealth: 300,
      mana: 180,
      maxMana: 290,
    } as OwnCharacterState,
    fightState: {
      attackTargetId: null,
      mode: { attack: "offensive", chase: false, secure: true },
      conditions: [
        { type: "combat-lock", remainingMs: 24_000, stacks: 1 },
      ],
      cooldowns: [],
    },
    hasWeapon: true,
    spells: [
      {
        id: "exura-infir-ico",
        origin: "spell",
        runeItemTypeId: null,
        name: "Bruise Bane",
        words: "exura infir ico",
        damageType: "healing",
        effectId: 13,
        manaCost: 10,
        soulCost: 0,
        requiredLevel: 1,
        requiredMagicLevel: 0,
        needWeapon: false,
        cooldownMs: 1_000,
        cooldownGroups: [
          "spell:exura-infir-ico",
          "group:healing",
        ],
        targetKind: "self",
      },
    ],
    actionBar: ["exura-infir-ico"],
    potionActionBar: [],
    inventory: null,
    combatLog: ["You gained 5 experience."],
    chatPinnedOpen: false,
    chatChannels: [
      {
        id: "world",
        label: "World",
        kind: "world",
        description: "Realm-wide · 1,284 adventurers online",
        canSend: true,
        messages: [
          {
            id: "world:1",
            time: "18:42",
            sender: "Rowan Blackthorn",
            body: "Anyone heading into the Ashen Crypt?",
          },
        ],
      },
      {
        id: "guild",
        label: "Guild",
        kind: "guild",
        description: "Iron Ravens · 12 members online",
        canSend: true,
        unreadCount: 3,
        messages: [],
      },
      {
        id: "whisper:aria",
        label: "Aria Vale",
        kind: "whisper",
        description: "Private conversation · Online",
        canSend: true,
        closable: true,
        unreadCount: 1,
        messages: [],
      },
      {
        id: "system",
        label: "System",
        kind: "system",
        description: "Combat, loot, and server notices",
        canSend: false,
        messages: [
          {
            id: "system:1",
            body: "You gained 5 experience.",
            tone: "notice",
          },
        ],
      },
    ],
    onCast: fn(),
    onActivatePotion: fn(),
    onConfigureActionBar: fn(),
    onConfigurePotionActionBar: fn(),
    onChatChannelSelect: fn(),
    onChatChannelClose: fn(),
    onChatSenderSelect: fn(),
    onSendChat: fn(),
    onChatPinnedOpenChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop relative h-dvh overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-radial from-ui-stone/10 to-transparent"
        />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GameHud>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
