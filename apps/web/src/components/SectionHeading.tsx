import type { ReactNode } from 'react';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className = '',
}: SectionHeadingProps) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[11px] uppercase tracking-[0.32em] text-amber/80">{eyebrow}</p>
        ) : null}
        <h2 className="bg-gradient-to-r from-ink via-ink to-muted bg-clip-text text-2xl font-semibold tracking-wide text-transparent sm:text-3xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
