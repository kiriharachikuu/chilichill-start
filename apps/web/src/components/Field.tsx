import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition focus:border-amber/60 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-amber/15 disabled:cursor-not-allowed disabled:opacity-60';

interface FieldProps {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({
  label,
  required = false,
  hint,
  error,
  className = '',
  children,
  htmlFor,
}: FieldProps) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink/80">
          {label}
          {required ? <span className="text-coral">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-coral">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted/80">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return <input ref={ref} className={`${inputClass} ${className}`} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={`${inputClass} resize-y leading-relaxed ${className}`} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${inputClass} ${className}`} {...rest}>
        {children}
      </select>
    );
  },
);
