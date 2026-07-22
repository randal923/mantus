import type { ComponentProps } from "react";

/** e2e-only stand-in for next/link; see nextImageStub.tsx. */
export default function NextLinkStub(props: ComponentProps<"a">) {
  return <a {...props} />;
}
