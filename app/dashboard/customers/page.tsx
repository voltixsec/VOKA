"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
  useCustomers,
} from "../../../hooks/useCustomers";

const DEMO_COMPANY_ID =
  "cms81hx5t0000o4t1rzftwpd5";

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

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] =
    useState(false);

  const { isArabic } = useLanguage();

  const {
    customers,
    loading,
    error,
  } = useCustomers(DEMO_COMPANY_ID);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return customers;
    }

    return customers.filter((customer) =>
      [
        customer.code,
        customer.name,
        customer.type,
        customer.status,
        customer.phone,
        customer.email,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(query)
        )
    );
  }, [customers, search]);

  const countStatus = (status: string) =>
    customers.filter(
      (customer) =>
        customer.status.toUpperCase() === status
    ).length;

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
          <Button>
            <span aria-hidden="true">＋</span>

            {isArabic
              ? "عميل جديد"
              : "New Customer"}
          </Button>
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
            value={customers.length}
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
            value={countStatus("ACTIVE")}
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
            value={countStatus("LEAD")}
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
                ? "فرص البيع"
                : "Prospects"
            }
            value={countStatus("PROSPECT")}
            badge={
              isArabic
                ? "فرصة بيع"
                : "Prospect"
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
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1.5" />
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
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
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
            <Button variant="secondary">
              {isArabic
                ? "تصفية"
                : "Filter"}
            </Button>

            <div className="relative">
              <Button
                variant="secondary"
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
                    onClick={() => {
                      exportCustomersCsv(
                        filteredCustomers,
                        isArabic
                      );

                      setExportOpen(false);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-start text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                  >
                    {isArabic
                      ? "تصدير بصيغة CSV"
                      : "Export CSV"}
                  </button>

                  <button
                    type="button"
                    disabled
                    className="block w-full rounded-lg px-3 py-2 text-start text-sm text-slate-500"
                  >
                    {isArabic
                      ? "تصدير Excel — قريبًا"
                      : "Export Excel — Soon"}
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
                ? `${filteredCustomers.length} نتيجة`
                : `${filteredCustomers.length} ${
                    filteredCustomers.length === 1
                      ? "result"
                      : "results"
                  }`}
            </span>
          </div>
        </div>
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
        filteredCustomers.length === 0 && (
          <CustomerEmptyState
            isArabic={isArabic}
          />
        )}

      {!loading &&
        !error &&
        filteredCustomers.length > 0 && (
          <CustomerTable
            customers={filteredCustomers}
            isArabic={isArabic}
          />
        )}
    </section>
  );
}

