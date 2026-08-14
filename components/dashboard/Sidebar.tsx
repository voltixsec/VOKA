"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useLanguage } from "../i18n/LanguageProvider";

interface NavigationItem {
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
  href: string;
  icon: ReactNode;
}

function Icon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const navigationItems: NavigationItem[] = [
  {
    labelEn: "Dashboard",
    labelAr: "لوحة التحكم",
    descriptionEn: "Overview",
    descriptionAr: "نظرة عامة",
    href: "/dashboard",
    icon: (
      <Icon>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </Icon>
    ),
  },
  {
    labelEn: "Customers",
    labelAr: "العملاء",
    descriptionEn: "CRM",
    descriptionAr: "إدارة العملاء",
    href: "/dashboard/customers",
    icon: (
      <Icon>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </Icon>
    ),
  },
  {
    labelEn: "Products & Services",
    labelAr: "المنتجات والخدمات",
    descriptionEn: "Catalog",
    descriptionAr: "الكتالوج",
    href: "/dashboard/products",
    icon: (
      <Icon>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="m3.27 6.96 8.73 5.05 8.73-5.05" />
        <path d="M12 22.08V12" />
      </Icon>
    ),
  },
  {
    labelEn: "Quotations",
    labelAr: "عروض الأسعار",
    descriptionEn: "Sales offers",
    descriptionAr: "العروض والمبيعات",
    href: "/dashboard/quotations",
    icon: (
      <Icon>
        <path d="M6 2h9l5 5v15H6z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </Icon>
    ),
  },
  {
    labelEn: "Sales Orders",
    labelAr: "أوامر البيع",
    descriptionEn: "Approved deals",
    descriptionAr: "الصفقات المعتمدة",
    href: "/dashboard/sales-orders",
    icon: (
      <Icon>
        <path d="M6 2h9l5 5v15H6z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6" />
        <path d="m9 17 2 2 4-4" />
      </Icon>
    ),
  },
  {
    labelEn: "Contracts / Invoices",
    labelAr: "العقود والفواتير",
    descriptionEn: "Approved deals",
    descriptionAr: "الصفقات المعتمدة",
    href: "/dashboard/contracts",
    icon: (
      <Icon>
        <path d="M4 2h16v20H4z" />
        <path d="M8 6h8" />
        <path d="M8 10h8" />
        <path d="M8 14h4" />
        <path d="m15 17 2 2 3-4" />
      </Icon>
    ),
  },
  {
    labelEn: "Settings",
    labelAr: "الإعدادات",
    descriptionEn: "Workspace",
    descriptionAr: "مساحة العمل",
    href: "/dashboard/settings",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.2 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 3.8 15" />
      </Icon>
    ),
  },
];

function isActive(
  pathname: string,
  href: string
) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const { isArabic } = useLanguage();

  return (
    <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col border-e border-white/10 bg-slate-950">
      <div className="border-b border-white/10 px-6 py-6">
        <Link
          href="/dashboard"
          className="inline-flex flex-col"
        >
          <span className="text-2xl font-bold tracking-tight text-white">
            VOKA
          </span>

          <span className="mt-1 text-sm font-medium text-sky-300">
            AI Sales OS
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
        {navigationItems.map((item) => {
          const active = isActive(
            pathname,
            item.href
          );

          const label = isArabic
            ? item.labelAr
            : item.labelEn;

          const description = isArabic
            ? item.descriptionAr
            : item.descriptionEn;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group flex items-center gap-4 rounded-2xl border px-4 py-3 transition duration-200",
                active
                  ? "border-sky-400/20 bg-sky-400/10 text-white"
                  : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
                  active
                    ? "bg-sky-400 text-slate-950"
                    : "bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-white",
                ].join(" ")}
              >
                {item.icon}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {label}
                </span>

                <span
                  className={[
                    "mt-1 block truncate text-xs",
                    active
                      ? "text-sky-200"
                      : "text-slate-600 group-hover:text-slate-400",
                  ].join(" ")}
                >
                  {description}
                </span>
              </span>

              {active && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.9)]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sm font-bold text-sky-300">
            VO
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {isArabic
                ? "مساحة عمل VOKA"
                : "VOKA Workspace"}
            </p>

            <p className="truncate text-xs text-slate-500">
              {isArabic
                ? "إدارة عمليات المبيعات"
                : "Sales Operations"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
