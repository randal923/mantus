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
    <section className="portal-box overflow-hidden">
      <h2 className="portal-box-header">
        <span className="portal-box-title">{title}</span>
      </h2>
      {children}
    </section>
  );
}
