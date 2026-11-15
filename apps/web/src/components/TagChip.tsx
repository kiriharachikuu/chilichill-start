import type { Tag } from '@spaceport/shared';

interface TagChipProps {
  tag: Pick<Tag, 'name' | 'color'>;
  selected?: boolean;
  count?: number;
  onClick?: () => void;
  muted?: boolean;
  className?: string;
}

export default function TagChip({
  tag,
  selected = false,
  count,
  onClick,
  muted = false,
  className = '',
}: TagChipProps) {
  const interactive = Boolean(onClick);
  const interactiveClass = interactive
    ? 'cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:brightness-125'
    : '';
  const stateClass = selected
    ? 'border-transparent text-ink'
    : muted
      ? 'border-white/10 text-muted'
      : 'border-white/15 text-ink/85';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${stateClass} ${interactiveClass} ${className}`}
      style={
        selected
          ? { backgroundColor: `${tag.color}26`, boxShadow: `inset 0 0 0 1px ${tag.color}88` }
          : { borderColor: `${tag.color}44`, backgroundColor: `${tag.color}10` }
      }
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
      {tag.name}
      {typeof count === 'number' ? <span className="text-muted">{count}</span> : null}
    </button>
  );
}
