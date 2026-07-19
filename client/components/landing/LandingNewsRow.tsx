interface LandingNewsRowProps {
  tag: string;
  date: string;
  title: string;
  excerpt: string;
}

export function LandingNewsRow({
  tag,
  date,
  title,
  excerpt,
}: LandingNewsRowProps) {
  return (
    <article className="flex flex-col gap-2 px-5 py-4 even:bg-black/25 sm:flex-row sm:gap-5">
      <div className="flex shrink-0 items-center gap-2 sm:w-32 sm:flex-col sm:items-start sm:gap-1.5">
        <span className="rounded-sm border border-ui-accent/55 bg-ui-accent-deep/50 px-2 py-0.5 font-display text-[0.625rem] font-bold tracking-widest text-ui-accent-light uppercase">
          {tag}
        </span>
        <time className="text-xs text-ui-muted">{date}</time>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="font-display text-sm font-bold tracking-wide text-ui-text-bright uppercase">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-ui-text">{excerpt}</p>
      </div>
    </article>
  );
}
