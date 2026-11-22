import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'children'> {
  /** 半选态（父级部分选中），优先于 checked 展示 */
  indeterminate?: boolean;
  /** 标签文本，渲染在选框右侧；多行时外层 label 自动顶部对齐需自行传 className="items-start" */
  children?: ReactNode;
  className?: string;
}

/**
 * 平面风格复选框：隐藏原生 input（保留键盘与焦点环），选框样式与站点直角边框语言一致。
 * 受控组件：必须传入 checked 与 onChange。
 */
export default function Checkbox({
  checked = false,
  indeterminate = false,
  className = '',
  children,
  ...rest
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const active = checked || indeterminate;

  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 ${className}`.trim()}>
      <input ref={inputRef} type="checkbox" className="peer sr-only" checked={checked} {...rest} />
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center border border-ink transition-colors duration-150 ${
          active ? 'bg-ink text-white' : 'bg-white text-transparent'
        } peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-amber/60 peer-disabled:cursor-not-allowed peer-disabled:opacity-50`}
      >
        {indeterminate ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
      </span>
      {children}
    </label>
  );
}
