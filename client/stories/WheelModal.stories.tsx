import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import {
  WHEEL_LIMITS,
  type GemStateMessage,
  type WheelStateMessage,
} from "@tibia/protocol";
import { WheelModal } from "../components/wheel/WheelModal";

const slices = (points: Readonly<Record<number, number>>): number[] => {
  const result = new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);
  for (const [id, value] of Object.entries(points)) {
    result[Number(id) - 1] = value;
  }
  return result;
};

const EMPTY_WHEEL: WheelStateMessage = {
  type: "wheel-state",
  slices: slices({}),
  totalPoints: 455,
  unlocked: true,
};

/** A red-domain push toward revelation stage 1, like a fresh sorcerer build. */
const RED_BUILD: WheelStateMessage = {
  type: "wheel-state",
  slices: slices({ 16: 50, 10: 75, 17: 75, 4: 100, 11: 100, 18: 50 }),
  totalPoints: 455,
  unlocked: true,
};

/** A small revealed collection with one gem socketed in the green vessel. */
const SAMPLE_GEMS: GemStateMessage = {
  type: "wheel-gems-state",
  resources: {
    lesserGems: 2,
    regularGems: 1,
    greaterGems: 0,
    lesserFragments: 12,
    greaterFragments: 3,
    gold: 2_500_000,
  },
  revealed: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      domain: "green",
      quality: "lesser",
      locked: false,
      basicModIds: [31],
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      domain: "red",
      quality: "regular",
      locked: true,
      basicModIds: [37, 3],
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      domain: "purple",
      quality: "greater",
      locked: false,
      basicModIds: [30, 9],
      supremeModId: 0,
    },
  ],
  equipped: { green: "00000000-0000-4000-8000-000000000001" },
  grades: { basic: [{ modId: 31, grade: 2 }], supreme: [] },
};

const meta = {
  title: "Game/WheelModal",
  component: WheelModal,
  parameters: { layout: "fullscreen" },
  args: {
    wheel: EMPTY_WHEEL,
    gems: SAMPLE_GEMS,
    vocation: "Sorcerer",
    pending: false,
    gemsPending: false,
    error: null,
    gemsError: null,
    onSave: fn(),
    onRequestGems: fn(),
    onGemAction: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof WheelModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = canvas.getByRole("dialog", { name: "Wheel of Destiny" });
    const wheel = canvas.getByRole("img", { name: "Wheel of Destiny" });
    const saveButton = canvas.getByRole("button", { name: "Save" });

    await expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
    await expect(saveButton.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      dialog.getBoundingClientRect().bottom,
    );
    await expect(wheel.parentElement).not.toHaveClass("overflow-x-auto");

    const emptySelection =
      "Select a slice of the wheel to inspect its perks.";
    const wheelRect = wheel.getBoundingClientRect();
    const target = {
      clientX: wheelRect.left + (290 / 522) * wheelRect.width,
      clientY: wheelRect.top + (290 / 522) * wheelRect.height,
    };

    await expect(canvas.getByText(emptySelection)).toBeVisible();
    fireEvent.mouseMove(wheel, target);
    await expect(canvas.getByText(emptySelection)).toBeVisible();
    fireEvent.click(wheel, target);
    await expect(canvas.queryByText(emptySelection)).not.toBeInTheDocument();
  },
};

export const RedDomainBuild: Story = {
  args: { wheel: RED_BUILD },
};

export const KnightBuild: Story = {
  args: {
    wheel: {
      type: "wheel-state",
      slices: slices({ 22: 50, 23: 75, 28: 75, 15: 50, 14: 75 }),
      totalPoints: 325,
      unlocked: true,
    },
    vocation: "Elite Knight",
  },
};

export const GemAtelier: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Gem Atelier" }));

    await expect(
      canvas.getByRole("heading", { name: "Vessels" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Gem Revelation" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Gem Collection" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", {
        name: "Click on a gem to see its mods",
      }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("searchbox", { name: "Search gems" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Filter by quality" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Filter by domain" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("checkbox", { name: "Locked only" }),
    ).toBeVisible();
    await expect(canvas.getByText("Page 1 / 1 (3 Gems)")).toBeVisible();

    const gemList = canvas.getByRole("list", { name: "Gem Collection" });
    await expect(gemList.children).toHaveLength(3);
    await userEvent.click(
      within(gemList).getByRole("button", { name: /Greater Sage Gem/ }),
    );
    const equip = canvas.getByRole("button", { name: "Place in Vessel" });
    await expect(equip).toBeEnabled();
    await userEvent.click(equip);
    await expect(args.onGemAction).toHaveBeenCalledWith({
      kind: "equip",
      gemId: "00000000-0000-4000-8000-000000000003",
    });
  },
};

export const FragmentWorkshop: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("tab", { name: "Fragment Workshop" }),
    );

    await expect(
      canvas.getByRole("heading", { name: "Enhance Mod Grade" }),
    ).toBeVisible();
    const search = canvas.getByRole("searchbox", { name: "Search mods" });
    await expect(search).toBeVisible();
    const filter = canvas.getByRole("combobox", { name: "Filter mods" });
    await expect(filter).toBeVisible();
    await expect(canvas.getByText("Page 1 / 3 (69 Mods)")).toBeVisible();
    const modList = canvas.getByRole("list", { name: "Mods" });
    await expect(modList.children).toHaveLength(30);
    const supremeIcon = modList.querySelector<HTMLElement>(
      '[style*="icons-skillwheel-suprememods.png"]',
    );
    await expect(supremeIcon?.parentElement).toHaveClass(
      "translate-x-[3px]",
      "-translate-y-0.5",
    );

    await userEvent.type(search, "Physical Resistance");
    const firstBasicMod = await within(modList).findByRole("button", {
      name: /Physical Resistance.*Grade I/,
    });
    await userEvent.click(firstBasicMod);
    const improve = canvas.getByRole("button", { name: "Improve" });
    await expect(improve).toBeEnabled();
    await userEvent.click(improve);
    await expect(args.onGemAction).toHaveBeenCalledWith({
      kind: "improve-grade",
      modKind: "basic",
      modId: 0,
    });
  },
};

export const Locked: Story = {
  args: {
    wheel: {
      type: "wheel-state",
      slices: slices({}),
      totalPoints: 0,
      unlocked: false,
    },
    vocation: "Druid",
  },
};

export const SaveRejected: Story = {
  args: { wheel: RED_BUILD, error: "invalid-allocation" },
};
