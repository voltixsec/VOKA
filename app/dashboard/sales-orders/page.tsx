"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, SectionHeader } from "../../../components/ui";
import { useLanguage } from "../../../components/i18n/LanguageProvider";

type SalesOrderStatusFilter = "ALL" | "DRAFT" | "CONFIRMED" | "CANCELLED";

type SalesOrderListItem = {
  id: string;
  number: string;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  sourceQuotationNumber: string;
  orderDate: string;
  currencyCode: string;
  customer: { name: string };
  totals: { totalAmount: number };
};

type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export default function SalesOrdersPage() {
  const { isArabic } = useLanguage();
  const [salesOrders, setSalesOrders] = useState<SalesOrderListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SalesOrderStatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");

  const t = (ar: string, en: string) => (isArabic ? ar : en);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setUnauthorized(false);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        locale: isArabic ? "ar" : "en",
      });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const response = await fetch(`/api/sales-orders?${params.toString()}`);
      if (response.status === 401 || response.status === 403) {
        setUnauthorized(true);
        return;
      }
      if (!response.ok) throw new Error("Unable to load Sales Orders");
      const body = await response.json();
      setSalesOrders(body.data.salesOrders);
      setPagination(body.data.pagination);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load Sales Orders",
      );
    } finally {
      setLoading(false);
    }
  }, [isArabic, page, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(isArabic ? "ar-KW" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(value);

  const renderBadge = (status: "DRAFT" | "CONFIRMED" | "CANCELLED") => {
    if (status === "CONFIRMED") {
      return <Badge variant="success">{t("مؤكد", "CONFIRMED")}</Badge>;
    }
    if (status === "CANCELLED") {
      return <Badge variant="danger">{t("ملغى", "CANCELLED")}</Badge>;
    }
    return <Badge variant="info">{t("مسودة", "DRAFT")}</Badge>;
  };

  return (
    <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <SectionHeader
        eyebrow={t("دورة المبيعات", "Sales lifecycle")}
        title={t("أوامر البيع", "Sales Orders")}
        description={t(
          "أوامر البيع المنشأة من عروض الأسعار المعتمدة.",
          "Sales Orders created from approved quotations.",
        )}
      />

      <Card padding="sm" className="space-y-4">
        <Input
          aria-label={t("البحث في أوامر البيع", "Search Sales Orders")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t(
            "ابحث برقم أمر البيع أو العرض أو العميل...",
            "Search by order, quotation, or customer...",
          )}
        />

        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "ALL", ar: "الكل", en: "All" },
              { key: "DRAFT", ar: "مسودة", en: "Draft" },
              { key: "CONFIRMED", ar: "مؤكد", en: "Confirmed" },
              { key: "CANCELLED", ar: "ملغى", en: "Cancelled" },
            ] as const
          ).map((item) => (
            <Button
              key={item.key}
              variant={statusFilter === item.key ? "primary" : "secondary"}
              size="sm"
              onClick={() => {
                setStatusFilter(item.key);
                setPage(1);
              }}
            >
              {t(item.ar, item.en)}
            </Button>
          ))}
        </div>
      </Card>

      {loading && (
        <Card aria-busy="true">
          <div className="h-28 animate-pulse rounded-2xl bg-white/5" />
        </Card>
      )}

      {!loading && unauthorized && (
        <Card className="border-amber-400/20 bg-amber-400/5">
          <p className="text-amber-200">
            {t(
              "ليست لديك صلاحية لعرض أوامر البيع.",
              "You are not authorized to view Sales Orders.",
            )}
          </p>
        </Card>
      )}

      {!loading && !unauthorized && error && (
        <Card className="border-red-400/20 bg-red-400/5">
          <p className="text-red-300">
            {t("تعذر تحميل أوامر البيع.", "Could not load Sales Orders.")}
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => void load()}>
            {t("إعادة المحاولة", "Retry")}
          </Button>
        </Card>
      )}

      {!loading && !unauthorized && !error && salesOrders.length === 0 && (
        <Card className="py-14 text-center">
          <h2 className="text-lg font-semibold">
            {t("لا توجد أوامر بيع", "No Sales Orders")}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {t(
              "أنشئ أمر بيع من عرض سعر معتمد.",
              "Create one from an approved quotation.",
            )}
          </p>
        </Card>
      )}

      {!loading && !unauthorized && !error && salesOrders.map((order) => (
        <Link
          key={order.id}
          href={`/dashboard/sales-orders/${encodeURIComponent(order.id)}`}
          className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-400"
          aria-label={`${t("فتح أمر البيع", "Open Sales Order")} ${order.number}`}
        >
          <Card padding="sm" className="flex flex-col gap-4 transition hover:border-sky-400/20 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-sky-300">{order.number}</p>
              <p className="mt-1 text-sm text-slate-300">{order.customer.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {t("عرض السعر", "Quotation")}: {order.sourceQuotationNumber}
              </p>
            </div>
            <div className="sm:text-end">
              {renderBadge(order.status)}
              <p className="mt-2 font-semibold">
                {money(order.totals.totalAmount, order.currencyCode)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(order.orderDate).toLocaleDateString(
                  isArabic ? "ar-KW" : "en-GB",
                )}
              </p>
            </div>
          </Card>
        </Link>
      ))}

      {!loading && !unauthorized && !error && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t("السابق", "Previous")}
          </Button>
          <span className="text-sm text-slate-500">
            {page} / {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("التالي", "Next")}
          </Button>
        </div>
      )}
    </section>
  );
}
