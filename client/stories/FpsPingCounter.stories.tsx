import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { FpsPingCounter } from "../components/FpsPingCounter";

const meta = {
  title: "FpsPingCounter",
  component: FpsPingCounter,
  parameters: { layout: "centered" },
} satisfies Meta<typeof FpsPingCounter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { latencyMs: 47 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = await canvas.findByLabelText(
      "Frame rate and server latency",
    );
    // The panel must be its own containing block, or its ui-panel-frame
    // ::before inner border anchors to an ancestor and draws a ghost frame.
    await expect(getComputedStyle(panel).position).toBe("relative");
  },
};

export const AwaitingFirstPong: Story = {
  args: { latencyMs: null },
};
