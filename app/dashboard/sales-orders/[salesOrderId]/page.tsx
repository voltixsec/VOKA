"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card, SectionHeader } from "../../../../components/ui";
import { useLanguage } from "../../../../components/i18n/LanguageProvider";

type SalesOrder = {
  id: string;
  number: string;
  status: "DRAFT";
  sourceQuotationId: string;
  sourceQuotationNumber: string;
  currencyCode: string;
  orderDate: string;
  customer: {
    name: string;
    email?: string | null;
    phone?: string | null;
    taxNumber?: string | null;
    billingAddress?: string | null;
  };
  subject?: string | null;
  brief?: string | null;
  projectName?: string | null;
  attentionName?: string | null;
  scopeType?: string | null;
  lines: Array<{
    id: string;
    position: number;
    itemCode?: string | null;
    itemName: string;
    description?: string | null;
    unitName?: string | null;
    quantity: number;
    unitPrice: number;
    discount: { type: string; value: number; amount: number } | null;
    taxPercentage: number;
    taxAmount: number;
    totalAmount: number;
  }>;
  discount: { type: string; value: number; amount: number } | null;
  totals: {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
  };
  notes?: string | null;
  termsAndConditions?: string | null;
  sourceApproval: {
    approvedAt: string;
    approvedByName: string;
    approvedByRole: string;
  };
  creator: { name: string; role: string };
  createdAt: string;
};

const scopeLabels: Record<string, { ar: string; en: string }> = {
  SUPPLY_ONLY: { ar: "توريد فقط", en: "Supply only" },
  SUPPLY_AND_INSTALLATION: { ar: "توريد وتركيب", en: "Supply and installation" },
  INSTALLATION_ONLY: { ar: "تركيب فقط", en: "Installation only" },
  SERVICE: { ar: "خدمة", en: "Service" },
  MAINTENANCE: { ar: "صيانة", en: "Maintenance" },
  CONSULTATION: { ar: "استشارة", en: "Consultation" },
  CUSTOM: { ar: "مخصص", en: "Custom" },
};

export default function SalesOrderDetailsPage() {
  const { isArabic } = useLanguage();
  const params = useParams<{ salesOrderId: string }>();
  const [salesOrder, setSalesOrder] = useState<SalesOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const t = (ar: string, en: string) => (isArabic ? ar : en);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(
        `/api/sales-orders/${encodeURIComponent(params.salesOrderId)}?locale=${isArabic ? "ar" : "en"}`,
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Unable to load Sales Order");
      }
      const body = await response.json();
      setSalesOrder(body.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load Sales Order",
      );
    } finally {
      setLoading(false);
    }
  }, [isArabic, params.salesOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const money = (value: number) =>
    new Intl.NumberFormat(isArabic ? "ar-KW" : "en-US", {
      style: "currency",
      currency: salesOrder?.currencyCode ?? "KWD",
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(value);

  if (loading) {
    return <Card aria-busy="true"><div className="h-40 animate-pulse rounded-2xl bg-white/5" /></Card>;
  }

  if (error || !salesOrder) {
    return (
      <Card className="border-red-400/20 bg-red-400/5">
        <p className="text-red-300">{error || t("أمر البيع غير موجود.", "Sales Order not found.")}</p>
        <Link className="mt-4 inline-block text-sky-300" href="/dashboard/sales-orders">
          {t("العودة إلى أوامر البيع", "Back to Sales Orders")}
        </Link>
      </Card>
    );
  }

  return (
    <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <Link className="text-sm text-sky-300" href="/dashboard/sales-orders">
        {t("العودة إلى أوامر البيع", "Back to Sales Orders")}
      </Link>

      <SectionHeader
        eyebrow={t("مسودة أمر بيع", "Sales Order Draft")}
        title={salesOrder.subject || salesOrder.number}
        description={`${salesOrder.number} · ${salesOrder.customer.name}`}
        actions={<Badge>{t("مسودة", "DRAFT")}</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">{t("العميل", "Customer")}</p>
          <p className="mt-2 font-semibold">{salesOrder.customer.name}</p>
          <p className="mt-1 text-sm text-slate-400">
            {salesOrder.customer.email || salesOrder.customer.phone || "-"}
          </p>
          {salesOrder.customer.taxNumber && (
            <p className="mt-1 text-xs text-slate-500">{salesOrder.customer.taxNumber}</p>
          )}
        </Card>
        <Card>
          <p className="text-sm text-slate-500">{t("عرض السعر المصدر", "Source quotation")}</p>
          <Link
            href={`/dashboard/quotations/${encodeURIComponent(salesOrder.sourceQuotationId)}`}
            className="mt-2 inline-block font-semibold text-sky-300"
          >
            {salesOrder.sourceQuotationNumber}
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(salesOrder.sourceApproval.approvedAt).toLocaleString(isArabic ? "ar-KW" : "en-GB")}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">{t("الإجمالي", "Total")}</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300">
            {money(salesOrder.totals.totalAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(salesOrder.orderDate).toLocaleDateString(isArabic ? "ar-KW" : "en-GB")}
          </p>
        </Card>
      </div>

      {(salesOrder.projectName || salesOrder.attentionName || salesOrder.scopeType || salesOrder.brief) && (
        <Card>
          <h2 className="font-semibold">{t("بيانات المشروع", "Project details")}</h2>
          <dl className="mt-4 grid gap-4 md:grid-cols-3">
            <div><dt className="text-sm text-slate-500">{t("المشروع", "Project")}</dt><dd className="mt-1">{salesOrder.projectName || "-"}</dd></div>
            <div><dt className="text-sm text-slate-500">{t("عناية", "Attention")}</dt><dd className="mt-1">{salesOrder.attentionName || "-"}</dd></div>
            <div><dt className="text-sm text-slate-500">{t("النطاق", "Scope")}</dt><dd className="mt-1">{salesOrder.scopeType ? scopeLabels[salesOrder.scopeType]?.[isArabic ? "ar" : "en"] ?? salesOrder.scopeType : "-"}</dd></div>
          </dl>
          {salesOrder.brief && <p className="mt-5 whitespace-pre-wrap border-t border-white/10 pt-4 text-slate-300">{salesOrder.brief}</p>}
        </Card>
      )}

      <Card className="overflow-hidden" padding="sm">
        <h2 className="px-2 py-3 font-semibold">{t("بنود أمر البيع", "Sales Order lines")}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-sm">
            <thead className="border-y border-white/10 text-slate-500">
              <tr>
                <th className="px-3 py-3 text-start">#</th>
                <th className="px-3 py-3 text-start">{t("البند", "Item")}</th>
                <th className="px-3 py-3 text-start">{t("الوحدة", "Unit")}</th>
                <th className="px-3 py-3 text-end">{t("الكمية", "Quantity")}</th>
                <th className="px-3 py-3 text-end">{t("سعر الوحدة", "Unit price")}</th>
                <th className="px-3 py-3 text-end">{t("الخصم", "Discount")}</th>
                <th className="px-3 py-3 text-end">{t("الضريبة", "Tax")}</th>
                <th className="px-3 py-3 text-end">{t("الإجمالي", "Total")}</th>
              </tr>
            </thead>
            <tbody>
              {salesOrder.lines.map((line) => (
                <tr key={line.id} className="border-b border-white/5 align-top">
                  <td className="px-3 py-4 text-slate-500">{line.position}</td>
                  <td className="px-3 py-4">
                    <p className="font-medium">{line.itemName}</p>
                    {line.itemCode && <p className="mt-1 text-xs text-slate-500">{line.itemCode}</p>}
                    {line.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-400">{line.description}</p>}
                  </td>
                  <td className="px-3 py-4">{line.unitName || "-"}</td>
                  <td className="px-3 py-4 text-end">{line.quantity.toFixed(3)}</td>
                  <td className="px-3 py-4 text-end">{money(line.unitPrice)}</td>
                  <td className="px-3 py-4 text-end">{money(line.discount?.amount ?? 0)}</td>
                  <td className="px-3 py-4 text-end">{line.taxPercentage.toFixed(2)}% · {money(line.taxAmount)}</td>
                  <td className="px-3 py-4 text-end font-semibold">{money(line.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {salesOrder.notes && <Card><h2 className="font-semibold">{t("ملاحظات", "Notes")}</h2><p className="mt-3 whitespace-pre-wrap text-slate-300">{salesOrder.notes}</p></Card>}
          {salesOrder.termsAndConditions && <Card><h2 className="font-semibold">{t("الشروط والأحكام", "Terms and conditions")}</h2><p className="mt-3 whitespace-pre-wrap text-slate-300">{salesOrder.termsAndConditions}</p></Card>}
        </div>
        <Card>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">{t("المجموع الفرعي", "Subtotal")}</dt><dd>{money(salesOrder.totals.subtotal)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">{t("الخصم", "Discount")}</dt><dd>- {money(salesOrder.totals.discountAmount)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">{t("الضريبة", "Tax")}</dt><dd>{money(salesOrder.totals.taxAmount)}</dd></div>
            <div className="flex justify-between gap-4 border-t border-white/10 pt-3 text-base font-semibold"><dt>{t("الإجمالي النهائي", "Final total")}</dt><dd className="text-emerald-300">{money(salesOrder.totals.totalAmount)}</dd></div>
          </dl>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold">{t("سجل الإنشاء والاعتماد", "Creation and approval audit")}</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <div><dt className="text-sm text-slate-500">{t("اعتمد المصدر بواسطة", "Source approved by")}</dt><dd className="mt-1">{salesOrder.sourceApproval.approvedByName} · {salesOrder.sourceApproval.approvedByRole}</dd></div>
          <div><dt className="text-sm text-slate-500">{t("أنشئ أمر البيع بواسطة", "Sales Order created by")}</dt><dd className="mt-1">{salesOrder.creator.name} · {salesOrder.creator.role}</dd><dd className="mt-1 text-xs text-slate-500">{new Date(salesOrder.createdAt).toLocaleString(isArabic ? "ar-KW" : "en-GB")}</dd></div>
        </dl>
      </Card>
    </section>
  );
}
