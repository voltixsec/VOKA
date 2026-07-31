import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

export function TableContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "overflow-x-auto rounded-3xl border border-white/10",
        "bg-slate-900/70",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function Table({
  children,
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={[
        "min-w-full table-fixed border-collapse",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </table>
  );
}

export function TableHead({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={[
        "border-b border-white/10 bg-slate-900",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={className}
      {...props}
    >
      {children}
    </tbody>
  );
}

export function TableRow({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={[
        "border-b border-white/5 last:border-b-0",
        "transition hover:bg-white/[0.025]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHeaderCell({
  children,
  className = "",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={[
        "px-5 py-4 text-start text-sm font-medium text-slate-400",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className = "",
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={[
        "px-5 py-4 text-start text-sm text-slate-300",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </td>
  );
}
