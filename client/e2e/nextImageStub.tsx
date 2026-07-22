/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
import type { ComponentProps } from "react";

/**
 * e2e-only stand-in for next/image and next/link: the browser tests run
 * under plain Vite (no Next runtime), so the optimized components are
 * replaced with their raw DOM equivalents.
 */
export default function NextImageStub(
  props: Omit<ComponentProps<"img">, "loader"> & {
    fill?: boolean;
    priority?: boolean;
    unoptimized?: boolean;
  },
) {
  const { fill, priority, unoptimized, ...imgProps } = props;
  void fill;
  void priority;
  void unoptimized;
  return <img {...imgProps} />;
}
