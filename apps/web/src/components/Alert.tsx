import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

// 与站点色板对齐：coral（黑）为危险、mint（深蓝）为成功、amber 系（天蓝）为信息/警告
const STYLES: Record<AlertVariant, string> = {
  info: 'border-amber/35 bg-amber-50 text-amber-700',
  success: 'border-mint/35 bg-mint/10 text-mint',
  warning: 'border-amber-600/35 bg-amber-600/10 text-amber-600',
  danger: 'border-coral/35 bg-coral/10 text-coral',
};

const DEFAULT_ICONS: Record<AlertVariant, ReactNode> = {
  info: <Info className="h-3.5 w-3.5 shrink-0" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
  danger: <XCircle className="h-3.5 w-3.5 shrink-0" />,
};

export interface AlertProps {
  variant?: AlertVariant;
  /** 自定义图标，默认按 variant 给出 */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** 语义色调提示块：用于表单错误、操作结果、注意事项等内联提示 */
export default function Alert({ variant = 'info', icon, children, className = '' }: AlertProps) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 border px-3.5 py-2.5 text-xs leading-relaxed ${STYLES[variant]} ${className}`.trim()}
    >
      {icon ?? DEFAULT_ICONS[variant]}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
