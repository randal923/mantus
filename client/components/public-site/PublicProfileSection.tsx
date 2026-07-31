import type { ReactNode } from "react";

interface PublicProfileSectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function PublicProfileSection({
  title,
  children,
}: PublicProfileSectionProps) {
  return (
    <section className="ui-panel-frame relative overflow-hidden">
      <h2 className="border-b border-ui-accent/35 bg-[linear-gradient(90deg,rgba(91,16,12,0.82),rgba(20,22,21,0.92)_62%)] px-5 py-3 font-display text-sm font-bold tracking-widest text-ui-text-bright uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
