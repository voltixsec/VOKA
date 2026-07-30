import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({
  label,
  error,
  id,
  className = '',
  ...props
}: InputProps) {
  const inputId = id ?? props.name;

  return (
    <div className="space-y-2">
      {label ? (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-200"
        >
          {label}
        </label>
      ) : null}

      <input
        id={inputId}
        className={[
          'w-full rounded-2xl border bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition',
          'placeholder:text-slate-500 focus:ring-2',
          error
            ? 'border-red-500/70 focus:border-red-400 focus:ring-red-500/20'
            : 'border-slate-700 focus:border-sky-400 focus:ring-sky-400/20',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

