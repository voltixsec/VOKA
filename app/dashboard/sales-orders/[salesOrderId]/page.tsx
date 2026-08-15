"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Modal, SectionHeader } from "../../../../components/ui";
import { useLanguage } from "../../../../components/i18n/LanguageProvider";

type SalesOrder = {
  id: string;
  number: string;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
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
  confirmation?: {
    confirmedAt: string;
    confirmedByUserId?: string | null;
    confirmedByName: string;
    confirmedByRole: string;
  } | null;
  cancellation?: {
    cancelledAt: string;
    cancelledByUserId?: string | null;
    cancelledByName: string;
    cancelledByRole: string;
    reason: string;
  } | null;
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
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Cancellation modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonError, setCancelReasonError] = useState("");

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

  const handleConfirm = async () => {
    if (!salesOrder || actionLoading) return;
    try {
      setActionLoading(true);
      setActionError("");
      const response = await fetch(
        `/api/sales-orders/${encodeURIComponent(salesOrder.id)}/confirm?locale=${isArabic ? "ar" : "en"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedStatus: salesOrder.status }),
        },
      );

      if (response.status === 409) {
        setActionError(
          t(
            "تغيرت حالة أمر البيع. جاري إعادة تحميل البيانات...",
            "The Sales Order status has changed. Reloading latest state...",
          ),
        );
        await load();
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to confirm Sales Order");
      }

      const body = await response.json();
      setSalesOrder(body.data);
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : t("تعذر تأكيد أمر البيع.", "Failed to confirm Sales Order."),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!salesOrder || actionLoading) return;
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      setCancelReasonError(
        t("سبب الإلغاء مطلوب.", "Cancellation reason is required."),
      );
      return;
    }

    try {
      setActionLoading(true);
      setActionError("");
      setCancelReasonError("");

      const response = await fetch(
        `/api/sales-orders/${encodeURIComponent(salesOrder.id)}/cancel?locale=${isArabic ? "ar" : "en"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedStatus: salesOrder.status,
            reason: trimmedReason,
          }),
        },
      );

      if (response.status === 409) {
        setCancelModalOpen(false);
        setActionError(
          t(
            "تغيرت حالة أمر البيع. جاري إعادة تحميل البيانات...",
            "The Sales Order status has changed. Reloading latest state...",
          ),
        );
        await load();
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to cancel Sales Order");
      }

      const body = await response.json();
      setSalesOrder(body.data);
      setCancelModalOpen(false);
      setCancelReason("");
    } catch (caught) {
      setCancelReasonError(
        caught instanceof Error
          ? caught.message
          : t("تعذر إلغاء أمر البيع.", "Failed to cancel Sales Order."),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const renderStatusBadge = (status: "DRAFT" | "CONFIRMED" | "CANCELLED") => {
    if (status === "CONFIRMED") {
      return <Badge variant="success">{t("مؤكد", "CONFIRMED")}</Badge>;
    }
    if (status === "CANCELLED") {
      return <Badge variant="danger">{t("ملغى", "CANCELLED")}</Badge>;
    }
    return <Badge variant="info">{t("مسودة", "DRAFT")}</Badge>;
  };

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
        eyebrow={t("أمر بيع", "Sales Order")}
        title={salesOrder.subject || salesOrder.number}
        description={`${salesOrder.number} · ${salesOrder.customer.name}`}
        actions={
          <div className="flex items-center gap-3">
            {renderStatusBadge(salesOrder.status)}

            {salesOrder.status === "DRAFT" && (
              <>
                <Button
                  variant="primary"
                  disabled={actionLoading}
                  onClick={() => void handleConfirm()}
                >
                  {actionLoading
                    ? t("جاري التأكيد...", "Confirming...")
                    : t("تأكيد أمر البيع", "Confirm Sales Order")}
                </Button>
                <Button
                  variant="secondary"
                  disabled={actionLoading}
                  onClick={() => {
                    setCancelReason("");
                    setCancelReasonError("");
                    setCancelModalOpen(true);
                  }}
                >
                  {t("إلغاء أمر البيع", "Cancel Sales Order")}
                </Button>
              </>
            )}

            {salesOrder.status === "CONFIRMED" && (
              <Button
                variant="secondary"
                disabled={actionLoading}
                onClick={() => {
                  setCancelReason("");
                  setCancelReasonError("");
                  setCancelModalOpen(true);
                }}
              >
                {t("إلغاء أمر البيع", "Cancel Sales Order")}
              </Button>
            )}
          </div>
        }
      />

      {actionError && (
        <Card className="border-amber-400/20 bg-amber-400/5">
          <p className="text-amber-200">{actionError}</p>
        </Card>
      )}

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
        <h2 className="font-semibold">{t("سجل الحركة والتدقيق", "Lifecycle and audit log")}</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-sm text-slate-500">{t("اعتمد المصدر بواسطة", "Source approved by")}</dt>
            <dd className="mt-1">{salesOrder.sourceApproval.approvedByName} · {salesOrder.sourceApproval.approvedByRole}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">{t("أنشئ أمر البيع بواسطة", "Sales Order created by")}</dt>
            <dd className="mt-1">{salesOrder.creator.name} · {salesOrder.creator.role}</dd>
            <dd className="mt-1 text-xs text-slate-500">{new Date(salesOrder.createdAt).toLocaleString(isArabic ? "ar-KW" : "en-GB")}</dd>
          </div>

          {salesOrder.confirmation && (
            <div>
              <dt className="text-sm text-slate-500">{t("تم التأكيد بواسطة", "Confirmed by")}</dt>
              <dd className="mt-1">{salesOrder.confirmation.confirmedByName} · {salesOrder.confirmation.confirmedByRole}</dd>

              <dd className="mt-1 text-xs text-slate-500">
                {new Date(salesOrder.confirmation.confirmedAt).toLocaleString(isArabic ? "ar-KW" : "en-GB")}
              </dd>
            </div>
          )}

          {salesOrder.cancellation && (
            <div>
              <dt className="text-sm text-slate-500">{t("تم الإلغاء بواسطة", "Cancelled by")}</dt>
              <dd className="mt-1">{salesOrder.cancellation.cancelledByName} · {salesOrder.cancellation.cancelledByRole}</dd>

              <dd className="mt-1 text-xs text-slate-500">
                {new Date(salesOrder.cancellation.cancelledAt).toLocaleString(isArabic ? "ar-KW" : "en-GB")}
              </dd>
              <dd className="mt-2 text-xs font-medium text-red-300">
                {t("السبب", "Reason")}: {salesOrder.cancellation.reason}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Modal
        open={cancelModalOpen}
        title={t("إلغاء أمر البيع", "Cancel Sales Order")}
        description={t(
          "يرجى توضيح سبب إلغاء أمر البيع. الإلغاء إجراء نهائي ولا يمكن التراجع عنه.",
          "Please specify the reason for cancelling this Sales Order. Cancellation is terminal.",
        )}
        onClose={() => {
          if (!actionLoading) setCancelModalOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={actionLoading}
              onClick={() => setCancelModalOpen(false)}
            >
              {t("إلغاء", "Close")}
            </Button>
            <Button
              variant="danger"
              disabled={actionLoading}
              onClick={() => void handleCancelSubmit()}
            >
              {actionLoading
                ? t("جاري الإلغاء...", "Cancelling...")
                : t("تأكيد الإلغاء", "Confirm Cancellation")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            aria-label={t("سبب الإلغاء", "Cancellation reason")}
            placeholder={t("أدخل سبب إلغاء أمر البيع...", "Enter cancellation reason...")}
            value={cancelReason}
            onChange={(e) => {
              setCancelReason(e.target.value);
              setCancelReasonError("");
            }}
          />

          {cancelReasonError && (
            <p className="text-xs text-red-400">{cancelReasonError}</p>
          )}
        </div>
      </Modal>
    </section>
  );
}
