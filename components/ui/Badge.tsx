import type { ReactNode } from "react";

type BadgeVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral:
    "border-white/10 bg-white/5 text-slate-300",
  info:
    "border-sky-400/20 bg-sky-400/5 text-sky-200",
  success:
    "border-emerald-400/20 bg-emerald-400/5 text-emerald-200",
  warning:
    "border-amber-400/20 bg-amber-400/5 text-amber-200",
  danger:
    "border-red-400/20 bg-red-400/5 text-red-200",
};

export function Badge({
  children,
  variant = "neutral",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border",
        "px-3 py-1 text-xs font-medium",
        variantClasses[variant],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
