"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";

type SalesOrderOption = {
  id: string;
  number: string;
  orderDate: string;
  currencyCode: string;
  customer?: { name?: string | null };
  totals?: { totalAmount?: number };
};

type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function SalesOrderPicker({
  value,
  onChange,
  isArabic,
}: {
  value: string;
  onChange: (id: string) => void;
  isArabic: boolean;
}) {
  const t = (ar: string, en: string) => (isArabic ? ar : en);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<SalesOrderOption[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch((current) => {
        if (current !== searchInput) setPage(1);
        return searchInput;
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
        const q = new URLSearchParams({
          status: "CONFIRMED",
          page: String(page),
          pageSize: "20",
        });
        if (search.trim()) q.set("search", search.trim());
        if (isArabic) q.set("locale", "ar");
        const response = await fetch(`/api/sales-orders?${q}`);
        if (!response.ok) {
          throw new Error(t("تعذر تحميل أوامر البيع", "Unable to load sales orders"));
        }
        const body = await response.json();
        if (cancelled) return;
        setOrders(body.data?.salesOrders ?? []);
        setPagination(
          body.data?.pagination ?? {
            total: 0,
            page: 1,
            pageSize: 20,
            totalPages: 0,
          },
        );
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : t("حدث خطأ", "An error occurred"));
        setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [search, page, isArabic]);

  const money = (amount: number | undefined, currency: string) => {
    if (amount == null) return "";
    return new Intl.NumberFormat(isArabic ? "ar-KW" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 3,
    }).format(amount);
  };

  const label = (order: SalesOrderOption) => {
    const date = order.orderDate
      ? new Date(order.orderDate).toLocaleDateString(isArabic ? "ar-KW" : "en-GB")
      : "";
    const total = money(order.totals?.totalAmount, order.currencyCode || "KWD");
    return [order.number, order.customer?.name, date, total].filter(Boolean).join(" · ");
  };

  return (
    <div className="space-y-3">
      <Input
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        placeholder={t("ابحث برقم أمر البيع أو العميل", "Search sales order or customer")}
        aria-label={t("بحث أوامر البيع", "Search sales orders")}
      />
      {loading ? (
        <p className="text-sm text-slate-400">{t("جارٍ تحميل أوامر البيع المؤكدة…", "Loading confirmed sales orders…")}</p>
      ) : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!loading && !error && orders.length === 0 ? (
        <p className="text-sm text-slate-400">{t("لا توجد أوامر بيع مؤكدة متاحة.", "No confirmed sales orders available.")}</p>
      ) : null}
      {!loading && !error && orders.length > 0 ? (
        <label className="space-y-2 block">
          <span className="text-sm text-slate-400">{t("أمر البيع المؤكد", "Confirmed sales order")}</span>
          <select
            aria-label={t("أمر البيع المؤكد", "Confirmed sales order")}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-4"
          >
            <option value="">{t("اختر أمر بيع", "Select a sales order")}</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {label(order)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {!loading && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t("السابق", "Previous")}
          </Button>
          <span className="text-sm text-slate-500">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("التالي", "Next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
