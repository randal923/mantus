import type { ReactNode } from "react";

interface ImbuementPanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * One titled section of the imbuing window. Tibia stacks three of these —
 * the item, the imbuement choice, and the action — each under its own header
 * bar; this is that frame in our panel styling.
 */
export function ImbuementPanel({
  title,
  children,
  className,
}: ImbuementPanelProps) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col border border-ui-stone-light/15 bg-black/25 ${className ?? ""}`}
    >
      <h3 className="border-b border-ui-stone-light/15 bg-ui-panel-light/35 px-3 py-1.5 text-center font-display text-sm font-bold tracking-widest text-ui-gold uppercase sm:text-base">
        {title}
      </h3>
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </section>
  );
}
