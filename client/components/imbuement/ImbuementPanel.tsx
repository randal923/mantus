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
      className={`flex min-h-0 min-w-0 flex-col rounded-sm border border-ui-stone-light/15 bg-black/25 ${className ?? ""}`}
    >
      <h3 className="border-b border-ui-stone-light/15 px-3 py-1 font-display text-sm font-bold tracking-widest text-ui-gold uppercase">
        {title}
      </h3>
      <div className="min-h-0 min-w-0 flex-1 p-2.5">{children}</div>
    </section>
  );
}
