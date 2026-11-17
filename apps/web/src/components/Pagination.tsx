import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonClass } from './Button';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  /** 计数单位文案，默认「条信号」 */
  label?: string;
  /** 紧凑模式：去掉顶部间距，便于与其他控件并排一行 */
  flush?: boolean;
  /** 页码按钮排在计数文案前面（默认计数在前） */
  navFirst?: boolean;
}

function pageWindow(current: number, totalPages: number): number[] {
  const span = 5;
  let start = Math.max(1, current - Math.floor(span / 2));
  const end = Math.min(totalPages, start + span - 1);
  start = Math.max(1, end - span + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export default function Pagination({
  page,
  total,
  pageSize,
  onChange,
  label = '条信号',
  flush = false,
  navFirst = false,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize) return null;

  const count = (
    <p className="text-xs text-muted">
      共 {total} {label} · 第 {page} / {totalPages} 页
    </p>
  );
  const nav = (
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
  );

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${flush ? '' : 'pt-2'}`}>
      {navFirst ? (
        <>
          {nav}
          {count}
        </>
      ) : (
        <>
          {count}
          {nav}
        </>
      )}
    </div>
  );
}
