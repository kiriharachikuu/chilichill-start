import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: string;
  eyebrow?: string;
  footer?: ReactNode;
  children: ReactNode;
  variant?: 'center' | 'drawer';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const CENTER_SIZES: Record<string, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  full: 'max-w-4xl',
};

const DRAWER_SIZES: Record<string, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  full: 'max-w-4xl',
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  eyebrow,
  footer,
  children,
  variant = 'center',
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const titleId = useId();

  if (!open) return null;

  const panelClass =
    variant === 'drawer'
      ? `absolute inset-y-0 right-0 flex w-full ${DRAWER_SIZES[size] ?? DRAWER_SIZES.lg} flex-col border-l border-white/10 bg-space-900/95 shadow-card backdrop-blur-xl`
      : `relative flex max-h-[90vh] w-full ${CENTER_SIZES[size] ?? CENTER_SIZES.md} flex-col overflow-hidden rounded-2xl border border-white/12 bg-space-900/95 shadow-card backdrop-blur-xl`;

  return createPortal(
    <div
      className={`fixed inset-0 z-[80] flex ${
        variant === 'drawer' ? 'items-stretch justify-end' : 'items-center justify-center p-4'
      } bg-space-950/80 backdrop-blur-sm`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={panelClass} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}>
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-amber/80">{eyebrow}</p>
            ) : null}
            {title ? (
              <h3 id={titleId} className="text-lg font-semibold text-ink">
                {title}
              </h3>
            ) : null}
            {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.05] p-1.5 text-muted transition hover:border-amber/40 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
