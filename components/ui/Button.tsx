import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-slate-100 text-slate-950 hover:bg-white focus-visible:ring-slate-200',
  secondary:
    'border border-slate-700 bg-slate-900/70 text-white hover:border-slate-500 hover:bg-slate-900 focus-visible:ring-slate-500',
  ghost:
    'bg-transparent text-slate-300 hover:bg-white/5 hover:text-white focus-visible:ring-slate-600',
};

export function Button({
  children,
  variant = 'primary',
  fullWidth = false,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}
