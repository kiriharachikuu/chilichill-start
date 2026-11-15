import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padded?: boolean;
}

export default function Card({
  hover = true,
  padded = true,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={[
        'glass-card',
        padded ? 'p-5 sm:p-6' : '',
        hover
          ? 'transition-colors duration-200 hover:border-amber'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
