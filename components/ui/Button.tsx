import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "success"
  | "ghost";

type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-sky-400 text-slate-950 hover:bg-sky-300 focus:ring-sky-400/40",
  secondary:
    "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 focus:ring-white/20",
  danger:
    "bg-red-500 text-white hover:bg-red-400 focus:ring-red-500/40",
  success:
    "bg-emerald-500 text-slate-950 hover:bg-emerald-400 focus:ring-emerald-500/40",
  ghost:
    "bg-transparent text-slate-300 hover:bg-white/5 hover:text-white focus:ring-white/20",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-2 text-xs",
  md: "min-h-11 px-5 py-2.5 text-sm",
  lg: "min-h-12 px-6 py-3 text-base",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  type = "button",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold",
        "transition focus:outline-none focus:ring-4",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
