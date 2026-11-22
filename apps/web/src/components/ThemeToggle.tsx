import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'cc-theme';
const THEME_CHANGE_EVENT = 'cc-theme-change';

type Theme = 'light' | 'dark';

/** 读取初始主题：localStorage 记忆优先，否则跟随系统偏好 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage 不可用时忽略 */
  }
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 应用主题到根元素，并同步浏览器工具栏主题色 */
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('theme-dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#111111' : '#F4F4F1');
}

/** 主题状态 Hook：多实例间通过自定义事件保持同步 */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const sync = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 忽略存储失败 */
    }
    applyTheme(next);
    window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: next }));
    setTheme(next);
  };

  return { theme, toggle };
}

interface ThemeToggleProps {
  className?: string;
}

/** 夜间模式切换按钮：太阳 / 月亮图标，记忆到 localStorage，首次跟随系统 */
export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '切换到亮色模式' : '切换到夜间模式'}
      aria-pressed={isDark}
      title={isDark ? '切换到亮色模式' : '切换到夜间模式'}
      className={`flex h-9 w-9 shrink-0 items-center justify-center border border-ink bg-white text-ink transition-colors hover:bg-amber-50 hover:text-amber-600 ${className}`}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
