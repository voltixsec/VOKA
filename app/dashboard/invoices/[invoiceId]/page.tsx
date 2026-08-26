"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, SectionHeader } from "@/components/ui";
import { useLanguage } from "@/components/i18n/LanguageProvider";

type Invoice = {
  id: string;
  number: string;
  status: string;
  settlementStatus: string;
  origin: string;
  sourceKind: string | null;
  sourceId: string | null;
  sourceQuotationRevisionNumber: number | null;
  currencyCode: string;
  invoiceDate: string;
  dueDate: string | null;
  customer: { name: string };
  lines: Array<{
    position: number;
    itemName: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    totalAmount: number;
  }>;
  totals: {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
  };
  paidAmount: number;
  outstandingAmount: number;
  issuedAt: string | null;
  issuedBy: { name: string; role: string } | null;
  voidReason: string | null;
};
type Payment = {
  id: string;
  amount: number;
  currencyCode: string;
  method: string;
  receivedAt: string;
  reference: string | null;
  recordedByName: string;
  recordedByRole: string;
};
export default function InvoiceDetails() {
  const { isArabic } = useLanguage();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      const [a, b] = await Promise.all([
        fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`),
        fetch(
          `/api/invoices/${encodeURIComponent(invoiceId)}/payments?page=1&pageSize=50`,
        ),
      ]);
      if (!a.ok)
        throw new Error(isArabic ? "الفاتورة غير موجودة" : "Invoice not found");
      const aj = await a.json();
      setInvoice(aj.data);
      if (b.ok) {
        const bj = await b.json();
        setPayments(bj.data?.payments ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [invoiceId, isArabic]);
  useEffect(() => {
    void load();
  }, [load]);
  const money = (n: number) =>
    new Intl.NumberFormat(isArabic ? "ar-KW" : "en-US", {
      style: "currency",
      currency: invoice?.currencyCode ?? "KWD",
      minimumFractionDigits: 3,
    }).format(n);
  async function action(name: "issue" | "void") {
    if (!invoice) return;
    const body =
      name === "void"
        ? { reason: window.prompt(isArabic ? "سبب الإلغاء" : "Void reason") }
        : undefined;
    if (name === "void" && !body?.reason) return;
    try {
      setBusy(name);
      const r = await fetch(`/api/invoices/${invoice.id}/${name}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error?.message ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy("");
    }
  }
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    try {
      setBusy("payment");
      const r = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ amount, method, reference }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error?.message ?? "Payment failed");
      setAmount(0);
      setReference("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy("");
    }
  }
  if (!invoice)
    return (
      <Card>{error || (isArabic ? "جارٍ التحميل..." : "Loading...")}</Card>
    );
  return (
    <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <Link href="/dashboard/invoices" className="text-sky-300">
        {isArabic ? "العودة للفواتير" : "Back to invoices"}
      </Link>
      <SectionHeader
        eyebrow={isArabic ? "تفاصيل الفاتورة" : "Invoice details"}
        title={invoice.number}
        description={invoice.customer.name}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge>{invoice.status}</Badge>
            <Badge>{invoice.settlementStatus}</Badge>
            <a
              href={`/api/invoices/${encodeURIComponent(invoice.id)}/pdf?locale=${isArabic ? "ar" : "en"}`}
            >
              <Button variant="secondary">
                {isArabic ? "تنزيل PDF" : "Download PDF"}
              </Button>
            </a>
            <a href={`/api/invoices/${encodeURIComponent(invoice.id)}/xlsx`}>
              <Button variant="secondary">
                {isArabic ? "تنزيل Excel" : "Download Excel"}
              </Button>
            </a>
            {invoice.status === "DRAFT" && (
              <>
                <Link href={`/dashboard/invoices/${invoice.id}/edit`}>
                  <Button variant="secondary">
                    {isArabic ? "تعديل" : "Edit"}
                  </Button>
                </Link>
                <Button disabled={!!busy} onClick={() => void action("issue")}>
                  {isArabic ? "إصدار" : "Issue"}
                </Button>
              </>
            )}
            {invoice.status === "ISSUED" && invoice.paidAmount === 0 && (
              <Button
                variant="danger"
                disabled={!!busy}
                onClick={() => void action("void")}
              >
                {isArabic ? "إبطال" : "Void"}
              </Button>
            )}
          </div>
        }
      />
      {error && (
        <Card className="border-red-400/20">
          <p className="text-red-300">{error}</p>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-slate-500">{isArabic ? "الإجمالي" : "Total"}</p>
          <p className="mt-2 text-xl">{money(invoice.totals.totalAmount)}</p>
        </Card>
        <Card>
          <p className="text-slate-500">{isArabic ? "المدفوع" : "Paid"}</p>
          <p className="mt-2 text-xl text-emerald-300">
            {money(invoice.paidAmount)}
          </p>
        </Card>
        <Card>
          <p className="text-slate-500">
            {isArabic ? "المتبقي" : "Outstanding"}
          </p>
          <p className="mt-2 text-xl text-amber-300">
            {money(invoice.outstandingAmount)}
          </p>
        </Card>
      </div>
      <Card>
        <h3 className="font-semibold">
          {isArabic ? "المصدر والتدقيق" : "Provenance & audit"}
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          {invoice.origin}
          {invoice.sourceId ? ` · ${invoice.sourceId}` : ""}
          {invoice.sourceQuotationRevisionNumber !== null
            ? ` · Rev ${invoice.sourceQuotationRevisionNumber}`
            : ""}
        </p>
        {invoice.issuedAt && (
          <p className="mt-2 text-sm">
            {isArabic ? "أصدر بواسطة" : "Issued by"}: {invoice.issuedBy?.name} ·{" "}
            {new Date(invoice.issuedAt).toLocaleString()}
          </p>
        )}
        {invoice.voidReason && (
          <p className="mt-2 text-red-300">{invoice.voidReason}</p>
        )}
      </Card>
      <Card>
        <h3 className="font-semibold">{isArabic ? "البنود" : "Lines"}</h3>
        <div className="mt-3 space-y-2">
          {invoice.lines.map((line) => (
            <div
              key={line.position}
              className="grid grid-cols-4 gap-2 border-b border-white/10 py-2 text-sm"
            >
              <span>{line.itemName}</span>
              <span>{line.quantity}</span>
              <span>{money(line.unitPrice)}</span>
              <span className="text-end">{money(line.totalAmount)}</span>
            </div>
          ))}
        </div>
      </Card>
      {invoice.status === "ISSUED" && invoice.outstandingAmount > 0 && (
        <Card>
          <h3 className="font-semibold">
            {isArabic ? "تسجيل دفعة" : "Record payment"}
          </h3>
          <form onSubmit={pay} className="mt-3 grid gap-3 md:grid-cols-4">
            <Input
              required
              type="number"
              min="0.001"
              max={invoice.outstandingAmount}
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-4"
            >
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </select>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={isArabic ? "المرجع" : "Reference"}
            />
            <Button disabled={!!busy}>{isArabic ? "تسجيل" : "Record"}</Button>
          </form>
        </Card>
      )}
      <Card>
        <h3 className="font-semibold">
          {isArabic ? "سجل المدفوعات" : "Payment history"}
        </h3>
        {payments.length === 0 ? (
          <p className="mt-3 text-slate-500">
            {isArabic ? "لا توجد مدفوعات" : "No payments"}
          </p>
        ) : (
          payments.map((p) => (
            <div
              key={p.id}
              className="mt-3 flex justify-between border-b border-white/10 pb-3"
            >
              <div>
                <p>
                  {p.method}
                  {p.reference ? ` · ${p.reference}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(p.receivedAt).toLocaleString()} · {p.recordedByName}
                </p>
              </div>
              <p className="text-emerald-300">{money(p.amount)}</p>
            </div>
          ))
        )}
      </Card>
    </section>
  );
}
