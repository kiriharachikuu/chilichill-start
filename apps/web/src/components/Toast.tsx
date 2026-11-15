import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  push: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-mint/40 bg-mint/10 text-mint',
  error: 'border-coral/40 bg-coral/10 text-coral',
  info: 'border-aurora/40 bg-aurora/10 text-aurora',
};

const TONE_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const api = useMemo<ToastApi>(() => {
    const push = (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current;
      nextId.current += 1;
      setItems((prev) => [...prev, { id, tone, message }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 3800);
    };
    return {
      push,
      success: (message: string) => push(message, 'success'),
      error: (message: string) => push(message, 'error'),
      info: (message: string) => push(message, 'info'),
    };
  }, []);

  const remove = (id: number) => setItems((prev) => prev.filter((item) => item.id !== id));

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:w-[380px]">
          {items.map((item) => {
            const Icon = TONE_ICONS[item.tone];
            return (
              <div
                key={item.id}
                className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-white/12 bg-space-900/95 px-4 py-3 shadow-card backdrop-blur-xl"
              >
                <span className={`mt-0.5 rounded-lg border p-1.5 ${TONE_STYLES[item.tone]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <p className="flex-1 text-sm leading-relaxed text-ink/90">{item.message}</p>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label="关闭提示"
                  className="rounded-lg p-1 text-muted transition hover:bg-white/10 hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast 必须在 ToastProvider 内使用');
  }
  return context;
}
