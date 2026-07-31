import type {
  HTMLAttributes,
  ReactNode,
} from "react";

interface CardProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  children,
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "rounded-3xl border border-white/10",
        "bg-slate-900/70 shadow-soft",
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
