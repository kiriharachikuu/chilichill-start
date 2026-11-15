import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonClass } from './Button';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

function pageWindow(current: number, totalPages: number): number[] {
  const span = 5;
  let start = Math.max(1, current - Math.floor(span / 2));
  const end = Math.min(totalPages, start + span - 1);
  start = Math.max(1, end - span + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export default function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-xs text-muted">
        共 {total} 条信号 · 第 {page} / {totalPages} 页
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageWindow(page, totalPages).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={
              item === page
                ? 'h-8 min-w-8 rounded-lg border border-amber/50 bg-amber/15 px-2 text-xs font-semibold text-amber'
                : 'h-8 min-w-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-muted transition hover:border-amber/40 hover:text-ink'
            }
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
          aria-label="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
