import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/40 px-6 py-12 text-center">
      {icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
          {icon}
        </div>
      )}

      <h3 className="text-lg font-semibold text-white">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
        {description}
      </p>

      {action && (
        <div className="mt-6 flex justify-center">
          {action}
        </div>
      )}
    </div>
  );
}
