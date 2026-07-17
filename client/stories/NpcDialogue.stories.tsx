import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { NpcDialogue } from "../components/npc/NpcDialogue";

const meta = {
  title: "NPC/NpcDialogue",
  component: NpcDialogue,
  args: {
    dialogue: {
      type: "npc-dialogue",
      npcId: "npc:captain-bluebear:1",
      npcName: "Captain Bluebear",
      conversationId: "da29db8c-33a7-4935-a056-3f9dd87bafcc",
      position: { x: 32310, y: 32210, z: 6 },
      text: "Where do you want to go?",
      options: [
        { id: "carlin", label: "Carlin · 110 gold" },
        { id: "edron", label: "Edron · 160 gold" },
        { id: "farewell", label: "Bye" },
      ],
    },
    onChoice: fn(),
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex min-h-96 items-end justify-center p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NpcDialogue>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
