"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, SectionHeader } from "@/components/ui";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { ModuleSummaryBar } from "@/components/reporting/ModuleSummaryBar";
import { displayLabel } from "@/lib/i18n/display-labels";

type Row = {
  id: string;
  number: string;
  status: string;
  settlementStatus: string;
  invoiceDate: string;
  dueDate: string | null;
  currencyCode: string;
  customer: { name: string };
  totals: { totalAmount: number };
  paidAmount: number;
  outstandingAmount: number;
};

type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const EMPTY_PAGINATION: Pagination = {
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
};

export default function InvoicesPage() {
  const { isArabic } = useLanguage();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput;
      setSearch((current) => {
        if (current !== next) setPage(1);
        return next;
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const q = new URLSearchParams();
        if (search.trim()) q.set("search", search.trim());
        q.set("page", String(page));
        q.set("pageSize", "20");
        const r = await fetch(`/api/invoices?${q}`);
        if (!r.ok) throw new Error(isArabic ? "تعذر تحميل الفواتير" : "Unable to load invoices");
        const b = await r.json();
        if (cancelled) return;
        setRows(b.data.invoices ?? []);
        setPagination(b.data.pagination ?? EMPTY_PAGINATION);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [search, page, isArabic]);

  const money = (n: number, c: string) =>
    new Intl.NumberFormat(isArabic ? "ar-KW" : "en-US", {
      style: "currency",
      currency: c,
      minimumFractionDigits: 3,
    }).format(n);

  return (
    <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <SectionHeader
        eyebrow={isArabic ? "الذمم المدينة" : "Receivables"}
        title={isArabic ? "الفواتير والمدفوعات" : "Invoices & Payments"}
        description={
          isArabic
            ? "إصدار المطالبات المالية ومتابعة التحصيل الحقيقي."
            : "Issue financial claims and track actual settlement."
        }
        actions={
          <div className="flex gap-3">
            <Link href="/dashboard/reports">
              <Button variant="secondary">{isArabic ? "أعمار الذمم" : "Aging report"}</Button>
            </Link>
            <Link href="/dashboard/invoices/new">
              <Button>{isArabic ? "إنشاء فاتورة" : "Create invoice"}</Button>
            </Link>
          </div>
        }
      />
      <ModuleSummaryBar module="invoices" isArabic={isArabic} />
      <Card padding="sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:max-w-md">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={isArabic ? "ابحث برقم الفاتورة أو العميل" : "Search invoice or customer"}
            />
          </div>
          <span className="text-sm text-slate-500">
            {isArabic
              ? `${pagination.total} نتيجة`
              : `${pagination.total} ${pagination.total === 1 ? "result" : "results"}`}
          </span>
        </div>
      </Card>
      {loading && (
        <Card>
          <div className="h-24 animate-pulse rounded-xl bg-white/5" />
        </Card>
      )}
      {error && (
        <Card className="border-red-400/20">
          <p className="text-red-300">{error}</p>
        </Card>
      )}
      {!loading && !error && rows.length === 0 && (
        <Card className="py-12 text-center">{isArabic ? "لا توجد فواتير بعد" : "No invoices yet"}</Card>
      )}
      {!loading &&
        !error &&
        rows.map((row) => (
          <Link key={row.id} href={`/dashboard/invoices/${row.id}`}>
            <Card padding="sm" className="mb-3 flex items-center justify-between hover:border-sky-400/20">
              <div>
                <p className="font-semibold text-sky-300">{row.number}</p>
                <p className="text-sm text-slate-300">{row.customer.name}</p>
                <p className="text-xs text-slate-500">
                  {new Date(row.invoiceDate).toLocaleDateString(isArabic ? "ar-KW" : "en-GB")}
                </p>
              </div>
              <div className="text-end">
                <div className="flex gap-2">
                  <Badge>{displayLabel(row.status, isArabic ? "ar" : "en")}</Badge>
                  <Badge>{displayLabel(row.settlementStatus, isArabic ? "ar" : "en")}</Badge>
                </div>
                <p className="mt-2">{money(row.totals.totalAmount, row.currencyCode)}</p>
                <p className="text-xs text-amber-300">
                  {isArabic ? "المتبقي" : "Outstanding"}: {money(row.outstandingAmount, row.currencyCode)}
                </p>
              </div>
            </Card>
          </Link>
        ))}
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
