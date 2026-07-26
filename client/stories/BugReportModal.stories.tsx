import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { BugReportModal } from "../components/profile/BugReportModal";

const handlers = {
  onReport: fn(),
  onClose: fn(),
};

const meta = {
  title: "Game/BugReportModal",
  component: BugReportModal,
  parameters: { layout: "fullscreen" },
  args: {
    pending: false,
    error: null,
    ...handlers,
  },
} satisfies Meta<typeof BugReportModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Submit stays disabled until text is entered, then sends category+text. */
export const Compose: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole("button", { name: "Send report" });
    await expect(submit).toBeDisabled();
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Description" }),
      "The depot chest in Thais eats the last backpack slot.",
    );
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await expect(args.onReport).toHaveBeenCalledWith(
      "bug",
      "The depot chest in Thais eats the last backpack slot.",
    );
  },
};

export const Pending: Story = {
  args: { pending: true },
};

/** Server-enforced limits surface plainly; the client adds no cooldown UI. */
export const RateLimited: Story = {
  args: { error: "Please wait a moment before trying again." },
};
