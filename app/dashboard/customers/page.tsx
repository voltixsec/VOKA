"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";

import {
  Badge,
  Button,
  Card,
  Input,
  SectionHeader,
} from "../../../components/ui";
import { useLanguage } from "../../../components/i18n/LanguageProvider";
import { CustomerEmptyState } from "../../../features/customers/components/CustomerEmptyState";
import { CustomerLoading } from "../../../features/customers/components/CustomerLoading";
import { CustomerTable } from "../../../features/customers/components/CustomerTable";
import {
  type Customer,
  fetchAllMatchingCustomers,
  useCustomers,
} from "../../../hooks/useCustomers";

interface StatCardProps {
  title: string;
  value: number;
  badge: string;
  badgeVariant:
    | "neutral"
    | "info"
    | "success"
    | "warning";
  icon: ReactNode;
}

function StatCard({
  title,
  value,
  badge,
  badgeVariant,
  icon,
}: StatCardProps) {
  return (
    <Card padding="sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {title}
          </p>

          <p className="mt-3 text-3xl font-semibold text-white">
            {value}
          </p>
        </div>

        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-slate-300">
          {icon}
        </span>
      </div>

      <div className="mt-4">
        <Badge variant={badgeVariant}>
          {badge}
        </Badge>
      </div>
    </Card>
  );
}

function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""')}"`;
}

function exportCustomersCsv(
  customers: Customer[],
  isArabic: boolean
) {
  const headers = isArabic
    ? [
        "الرمز",
        "العميل",
        "النوع",
        "الحالة",
        "الهاتف",
        "البريد الإلكتروني",
      ]
    : [
        "Code",
        "Customer",
        "Type",
        "Status",
        "Phone",
        "Email",
      ];

  const rows = customers.map((customer) => [
    customer.code,
    customer.name,
    customer.type,
    customer.status,
    customer.phone ?? "",
    customer.email ?? "",
  ]);

  const csv = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) =>
      row.map(escapeCsvValue).join(",")
    ),
  ].join("\n");

  const blob = new Blob(
    ["\uFEFF" + csv],
    {
      type: "text/csv;charset=utf-8;",
    }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = isArabic
    ? "عملاء-voka.csv"
    : "voka-customers.csv";

  link.click();
  URL.revokeObjectURL(url);
}

async function exportCustomersXlsx(customers: Customer[], isArabic: boolean) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VOKA";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(isArabic ? "العملاء" : "Customers", {
    views: [{ rightToLeft: isArabic }],
  });
  worksheet.columns = [
    { header: isArabic ? "الرمز" : "Code", key: "code", width: 18 },
    { header: isArabic ? "العميل" : "Customer", key: "name", width: 34 },
    { header: isArabic ? "النوع" : "Type", key: "type", width: 18 },
    { header: isArabic ? "الحالة" : "Status", key: "status", width: 18 },
    { header: isArabic ? "الهاتف" : "Phone", key: "phone", width: 22 },
    { header: isArabic ? "البريد الإلكتروني" : "Email", key: "email", width: 34 },
  ];
  customers.forEach((customer) => worksheet.addRow({ code: customer.code, name: customer.name, type: customer.type, status: customer.status, phone: customer.phone ?? "", email: customer.email ?? "" }));
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075985" } };
  worksheet.autoFilter = { from: "A1", to: "F1" };
  worksheet.views = [{ state: "frozen", ySplit: 1, rightToLeft: isArabic }];
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = isArabic ? "عملاء-voka.xlsx" : "voka-customers.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}

export default function CustomersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { isArabic } = useLanguage();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const {
    customers,
    pagination,
    summaries,
    loading,
    error,
  } = useCustomers({ search, status, type, page, pageSize: 20 });

  async function exportMatching(kind: "csv" | "xlsx") {
    try {
      setExporting(true);
      const rows = await fetchAllMatchingCustomers({ search, status, type });
      if (kind === "csv") exportCustomersCsv(rows, isArabic);
      else await exportCustomersXlsx(rows, isArabic);
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  }

  return (
    <section className="space-y-6">
      <SectionHeader
        eyebrow={
          isArabic
            ? "إدارة علاقات العملاء"
            : "Customer Relationship Management"
        }
        title={
          isArabic
            ? "العملاء"
            : "Customers"
        }
        description={
          isArabic
            ? "إدارة بيانات العملاء وعلاقات المبيعات."
            : "Manage customer records and sales relationships."
        }
        actions={
          <Link href="/dashboard/customers/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-400/40">
            <span aria-hidden="true">＋</span>{isArabic ? "عميل جديد" : "New Customer"}
          </Link>
        }
      />

      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title={
              isArabic
                ? "إجمالي العملاء"
                : "Total Customers"
            }
            value={summaries.total}
            badge={
              isArabic
                ? "الكل"
                : "All"
            }
            badgeVariant="info"
            icon={
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
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
          />

          <StatCard
            title={
              isArabic
                ? "العملاء النشطون"
                : "Active Customers"
            }
            value={summaries.ACTIVE}
            badge={
              isArabic
                ? "نشط"
                : "Active"
            }
            badgeVariant="success"
            icon={
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
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 2.5 2.5L16 9" />
              </svg>
            }
          />

          <StatCard
            title={
              isArabic
                ? "العملاء المحتملون"
                : "Leads"
            }
            value={summaries.LEAD}
            badge={
              isArabic
                ? "عميل محتمل"
                : "Lead"
            }
            badgeVariant="warning"
            icon={
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
                <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
              </svg>
            }
          />

          <StatCard
            title={
              isArabic
                ? "محظور"
                : "Blocked"
            }
            value={summaries.BLOCKED}
            badge={
              isArabic
                ? "محظور"
                : "Blocked"
            }
            badgeVariant="neutral"
            icon={
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
                <circle cx="12" cy="12" r="9" />
                <path d="m9 9 6 6" />
                <path d="m15 9-6 6" />
              </svg>
            }
          />
        </div>
      )}

      <Card
        padding="sm"
        className="relative z-20"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:max-w-md">
            <Input
              dir={isArabic ? "rtl" : "ltr"}
              value={searchInput}
              onChange={(event) =>
                setSearchInput(event.target.value)
              }
              placeholder={
                isArabic
                  ? "ابحث عن عميل..."
                  : "Search customers..."
              }
              leadingIcon={
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                  />

                  <path d="m20 20-3.5-3.5" />
                </svg>
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={filtersOpen ? "primary" : "secondary"}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              {isArabic
                ? "تصفية"
                : "Filter"}
            </Button>

            <div className="relative">
              <Button
                variant="secondary"
                disabled={exporting}
                onClick={() =>
                  setExportOpen((value) => !value)
                }
              >
                {isArabic
                  ? "تصدير"
                  : "Export"}

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="m7 10 5 5 5-5" />
                </svg>
              </Button>

              {exportOpen && (
                <div className="absolute end-0 top-[calc(100%+8px)] z-50 w-48 overflow-hidden rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => { void exportMatching("csv"); }}
                    className="block w-full rounded-lg px-3 py-2 text-start text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                  >
                    {isArabic
                      ? "تصدير بصيغة CSV"
                      : "Export CSV"}
                  </button>

                  <button type="button" onClick={() => { void exportMatching("xlsx"); }} className="block w-full rounded-lg px-3 py-2 text-start text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
                    {isArabic ? "تصدير Excel" : "Export Excel"}
                  </button>

                  <button
                    type="button"
                    disabled
                    className="block w-full rounded-lg px-3 py-2 text-start text-sm text-slate-500"
                  >
                    {isArabic
                      ? "تصدير PDF — قريبًا"
                      : "Export PDF — Soon"}
                  </button>
                </div>
              )}
            </div>

            <span className="text-sm text-slate-500">
              {isArabic
                ? `${pagination.total} نتيجة`
                : `${pagination.total} ${
                    pagination.total === 1
                      ? "result"
                      : "results"
                  }`}
            </span>
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-400">
              <span>{isArabic ? "الحالة" : "Status"}</span>
              <select
                aria-label={isArabic ? "الحالة" : "Status"}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-slate-100"
              >
                <option value="">{isArabic ? "الكل" : "All"}</option>
                <option value="LEAD">{isArabic ? "عميل محتمل" : "Lead"}</option>
                <option value="ACTIVE">{isArabic ? "نشط" : "Active"}</option>
                <option value="INACTIVE">{isArabic ? "غير نشط" : "Inactive"}</option>
                <option value="BLOCKED">{isArabic ? "محظور" : "Blocked"}</option>
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>{isArabic ? "النوع" : "Type"}</span>
              <select
                aria-label={isArabic ? "النوع" : "Type"}
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setPage(1);
                }}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-slate-100"
              >
                <option value="">{isArabic ? "الكل" : "All"}</option>
                <option value="COMPANY">{isArabic ? "شركة" : "Company"}</option>
                <option value="INDIVIDUAL">{isArabic ? "فرد" : "Individual"}</option>
              </select>
            </label>
          </div>
        )}
      </Card>

      {loading && <CustomerLoading />}

      {!loading && error && (
        <Card className="border-red-400/20 bg-red-400/5">
          <p className="font-medium text-red-300">
            {isArabic
              ? "تعذر تحميل العملاء"
              : "Failed to load customers"}
          </p>

          <p className="mt-2 text-sm text-red-200/70">
            {error}
          </p>
        </Card>
      )}

      {!loading &&
        !error &&
        customers.length === 0 && (
          <CustomerEmptyState
            isArabic={isArabic}
          />
        )}

      {!loading &&
        !error &&
        customers.length > 0 && (
          <CustomerTable
            customers={customers}
            isArabic={isArabic}
          />
        )}

      {!loading && !error && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {isArabic ? "السابق" : "Previous"}
          </Button>
          <span className="text-sm text-slate-500">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {isArabic ? "التالي" : "Next"}
          </Button>
        </div>
      )}
    </section>
  );
}
