import type {
  InputHTMLAttributes,
  ReactNode,
} from "react";

interface InputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leadingIcon?: ReactNode;
}

export function Input({
  label,
  error,
  leadingIcon,
  className = "",
  id,
  ...props
}: InputProps) {
  const inputId =
    id ?? props.name ?? undefined;

  return (
    <label
      htmlFor={inputId}
      className="block space-y-2"
    >
      {label && (
        <span className="block text-sm font-medium text-slate-300">
          {label}
        </span>
      )}

      <span className="relative block">
        {leadingIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-500">
            {leadingIcon}
          </span>
        )}

        <input
          id={inputId}
          className={[
            "min-h-11 w-full rounded-xl border",
            "border-white/10 bg-slate-950/70",
            "px-4 py-2.5 text-sm text-white",
            "placeholder:text-slate-600",
            "outline-none transition",
            "focus:border-sky-400/50 focus:ring-4 focus:ring-sky-400/10",
            "disabled:cursor-not-allowed disabled:opacity-50",
            leadingIcon ? "pl-11" : "",
            error
              ? "border-red-400/50 focus:border-red-400 focus:ring-red-400/10"
              : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
      </span>

      {error && (
        <span className="block text-xs text-red-300">
          {error}
        </span>
      )}
    </label>
  );
}
