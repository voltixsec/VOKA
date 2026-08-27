"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { Button, Card, Input, SectionHeader } from "@/components/ui";
import { ModuleSummaryBar } from "@/components/reporting/ModuleSummaryBar";
import { displayActorName, displayLabel } from "@/lib/i18n/display-labels";
type Invoice = {
  id: string;
  number: string;
  customer: { name: string };
  currencyCode: string;
  status: string;
  settlementStatus: string;
  outstandingAmount: string;
};
type Payment = {
  id: string;
  amount: string;
  currencyCode: string;
  method: string;
  receivedAt: string;
  reference: string | null;
  notes: string | null;
  recordedByName: string;
  invoice: {
    id: string;
    number: string;
    customerName: string;
    outstandingAmount: string;
  };
};
export default function PaymentsPage() {
  const { isArabic } = useLanguage();
  const locale = isArabic ? "ar" : "en";
  const t = (ar: string, en: string) => (isArabic ? ar : en);
  const [payments, setPayments] = useState<Payment[]>([]),
    [invoices, setInvoices] = useState<Invoice[]>([]),
    [invoiceId, setInvoiceId] = useState(""),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState("BANK_TRANSFER"),
    [receivedAt, setReceivedAt] = useState(() =>
      new Date().toISOString().slice(0, 10),
    ),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const requestKey = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [paymentResponse, invoiceResponse] = await Promise.all([
        fetch("/api/payments?pageSize=100", { cache: "no-store" }),
        fetch("/api/invoices?status=ISSUED&pageSize=100", {
          cache: "no-store",
        }),
      ]);
      if (!paymentResponse.ok || !invoiceResponse.ok)
        throw new Error(
          isArabic ? "تعذر تحميل المدفوعات" : "Could not load payments",
        );
      const [paymentBody, invoiceBody] = await Promise.all([
        paymentResponse.json(),
        invoiceResponse.json(),
      ]);
      setPayments(paymentBody.data.payments);
      setInvoices(
        invoiceBody.data.invoices.filter(
          (invoice: Invoice) => invoice.settlementStatus !== "PAID",
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [isArabic]);
  useEffect(() => {
    void load();
  }, [load]);
  const selected = invoices.find((invoice) => invoice.id === invoiceId);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (
      !window.confirm(
        t(
          `تأكيد تسجيل دفعة بقيمة ${amount} ${selected.currencyCode}؟`,
          `Confirm recording a payment of ${amount} ${selected.currencyCode}?`,
        ),
      )
    )
      return;
    try {
      setSaving(true);
      setError("");
      const response = await fetch(`/api/invoices/${selected.id}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey.current,
        },
        body: JSON.stringify({
          amount: Number(amount),
          method,
          receivedAt,
          reference: reference || null,
          notes: notes || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          body?.error?.message ??
            t("تعذر تسجيل الدفعة", "Could not record payment"),
        );
      requestKey.current = crypto.randomUUID();
      setAmount("");
      setReference("");
      setNotes("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment failed");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <SectionHeader
        eyebrow={t("التحصيل", "Receivables")}
        title={t("المدفوعات", "Payments")}
        description={t(
          "سجل دفع غير قابل للتعديل مرتبط بالفاتورة والعميل، مع رصيد قبل وبعد محفوظ على الخادم.",
          "Immutable payment records tied to invoice and customer, with server-authoritative settlement balances.",
        )}
        actions={<div className="flex flex-wrap gap-2"><a href="/api/payments/pdf"><Button variant="secondary">{t("تنزيل PDF", "Download PDF")}</Button></a><a href="/api/payments/xlsx"><Button variant="secondary">{t("تنزيل Excel", "Download Excel")}</Button></a></div>}
      />
      <ModuleSummaryBar module="payments" isArabic={isArabic} />
      {error ? (
        <Card className="border-red-400/20">
          <p className="text-red-300">{error}</p>
        </Card>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <h2 className="font-semibold">{t("تسجيل دفعة", "Record payment")}</h2>
          <p className="mt-2 text-xs leading-5 text-amber-200/80">
            {t(
              "لا يمكن تعديل الدفعة بعد التسجيل. راجع القيم ثم أكد العملية.",
              "Payments cannot be edited after recording. Review and confirm the transaction.",
            )}
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-slate-400">
                {t("الفاتورة", "Invoice")}
              </span>
              <select
                required
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
              >
                <option value="">
                  {t("اختر فاتورة صادرة", "Select an issued invoice")}
                </option>
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number} · {invoice.customer.name} ·{" "}
                    {invoice.outstandingAmount} {invoice.currencyCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-slate-400">
                {t("المبلغ", "Amount")}
              </span>
              <Input
                required
                type="number"
                min="0.001"
                step="0.001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-slate-400">
                {t("طريقة الدفع", "Payment method")}
              </span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
              >
                <option value="BANK_TRANSFER">
                  {t("تحويل بنكي", "Bank transfer")}
                </option>
                <option value="CASH">{t("نقدي", "Cash")}</option>
                <option value="CARD">{t("بطاقة", "Card")}</option>
                <option value="CHEQUE">{t("شيك", "Cheque")}</option>
                <option value="OTHER">{t("أخرى", "Other")}</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-slate-400">
                {t("تاريخ الدفع", "Payment date")}
              </span>
              <Input
                required
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
            </label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("المرجع", "Reference")}
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("ملاحظات", "Notes")}
              className="min-h-24 w-full rounded-xl border border-white/10 bg-slate-950 p-3"
            />
            <Button className="w-full" disabled={saving || !selected}>
              {saving
                ? t("جارٍ التسجيل...", "Recording…")
                : t("مراجعة وتسجيل الدفعة", "Review and record payment")}
            </Button>
          </form>
        </Card>
        <Card>
          <h2 className="font-semibold">
            {t("سجل المدفوعات", "Payment history")}
          </h2>
          {loading ? (
            <div className="mt-4 h-40 animate-pulse rounded-xl bg-white/5" />
          ) : payments.length === 0 ? (
            <p className="mt-5 text-sm text-slate-500">
              {t("لا توجد مدفوعات مسجلة.", "No payments recorded.")}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {payments.map((payment) => (
                <Link
                  key={payment.id}
                  href={`/dashboard/invoices/${payment.invoice.id}`}
                  className="grid gap-3 rounded-xl border border-white/10 p-4 transition hover:border-sky-400/30 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-medium text-sky-200">
                      {payment.invoice.number} · {payment.invoice.customerName}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {new Date(payment.receivedAt).toLocaleDateString(
                        isArabic ? "ar-KW" : "en-GB",
                      )}{" "}
                      · {displayLabel(payment.method, locale)}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold">
                      {payment.amount} {payment.currencyCode}
                    </p>
                    <p className="text-xs text-slate-500">
                      {displayActorName(payment.recordedByName, locale)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
