import type { HTMLAttributes, ReactNode } from 'react';

type BadgeVariant = 'neutral' | 'success' | 'info';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-slate-700 bg-white/5 text-slate-200',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

export function Badge({
  children,
  variant = 'neutral',
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </span>
  );
}
