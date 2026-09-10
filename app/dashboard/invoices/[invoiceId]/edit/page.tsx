"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CommercialComposer, CommercialLineEditor, ComposerSection, CustomerPicker, type CommercialCatalogItem, type CommercialLineDraft } from "@/components/commercial";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { Button, Card, Input, SectionHeader } from "@/components/ui";

type Customer = { id: string; name: string; nameAr?: string | null; nameEn?: string | null };
type Invoice = {
  id: string; number: string; status: string; origin: string; customerId: string; currencyCode: string;
  invoiceDate: string; dueDate: string | null; notes: string | null; termsAndConditions: string | null; updatedAt: string;
  lines: Array<Omit<CommercialLineDraft, "key"> & { id?: string }>;
};

export default function EditInvoicePage() {
  const { isArabic } = useLanguage(); const t = (ar: string, en: string) => isArabic ? ar : en;
  const { invoiceId } = useParams<{ invoiceId: string }>(); const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null), [customers, setCustomers] = useState<Customer[]>([]), [items, setItems] = useState<CommercialCatalogItem[]>([]);
  const [customerId, setCustomerId] = useState(""), [invoiceDate, setInvoiceDate] = useState(""), [dueDate, setDueDate] = useState(""), [notes, setNotes] = useState(""), [terms, setTerms] = useState(""), [lines, setLines] = useState<CommercialLineDraft[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");

  useEffect(() => { let cancelled = false; void (async () => { try {
    const responses = await Promise.all([fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`, { cache: "no-store" }), fetch("/api/customers?pageSize=100"), fetch("/api/catalog/items?pageSize=100&isActive=true")]);
    if (responses.some((response) => !response.ok)) throw new Error(isArabic ? "تعذر تحميل مسودة الفاتورة" : "Could not load invoice draft");
    const [invoiceBody, customerBody, itemBody] = await Promise.all(responses.map((response) => response.json())); if (cancelled) return;
    const loaded = invoiceBody.data as Invoice; if (loaded.status !== "DRAFT") throw new Error(isArabic ? "لا يمكن تعديل إلا مسودة الفاتورة" : "Only a draft invoice can be edited");
    setInvoice(loaded); setCustomerId(loaded.customerId); setInvoiceDate(loaded.invoiceDate.slice(0, 10)); setDueDate(loaded.dueDate?.slice(0, 10) ?? ""); setNotes(loaded.notes ?? ""); setTerms(loaded.termsAndConditions ?? "");
    setLines(loaded.lines.map((line, index) => ({ ...line, key: line.id ?? `invoice-line-${index + 1}`, catalogItemId: line.catalogItemId ?? "", itemCode: line.itemCode ?? "", description: line.description ?? "", unitName: line.unitName ?? "PCS", taxPercentage: Number(line.taxPercentage ?? 0) })));
    setCustomers(customerBody.data?.customers ?? []); setItems((Array.isArray(itemBody.data) ? itemBody.data : []).map((item: any) => ({ id: item.id, name: item.name, code: item.code, type: item.type, salePrice: item.salePrice == null ? null : Number(item.salePrice), description: item.description, unitName: item.unit?.symbol ?? item.unitName ?? "PCS", taxPercentage: Number(item.taxRate?.percentage ?? 0) })));
  } catch (caught) { setError(caught instanceof Error ? caught.message : t("تعذر تحميل البيانات", "Load failed")); } finally { if (!cancelled) setLoading(false); } })(); return () => { cancelled = true; }; }, [invoiceId, isArabic]);

  const totals = useMemo(() => lines.reduce((sum, line) => { const subtotal = line.quantity * line.unitPrice, tax = subtotal * line.taxPercentage / 100; return { subtotal: sum.subtotal + subtotal, tax: sum.tax + tax, total: sum.total + subtotal + tax }; }, { subtotal: 0, tax: 0, total: 0 }), [lines]);
  const money = (value: number) => new Intl.NumberFormat(isArabic ? "ar-KW" : "en-US", { style: "currency", currency: invoice?.currencyCode ?? "KWD" }).format(value);
  async function submit(event: FormEvent) { event.preventDefault(); if (!invoice) return; try { setSaving(true); setError("");
    const direct = invoice.origin === "DIRECT";
    const response = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: invoice.updatedAt, invoiceDate, dueDate: dueDate || null, notes: notes || null, termsAndConditions: terms || null, ...(direct ? { customerId, currencyCode: invoice.currencyCode, lines: lines.map(({ key: _key, ...line }, index) => ({ ...line, position: index + 1, catalogItemId: line.catalogItemId || null, description: line.description || null, unitName: line.unitName || "PCS" })) } : {}) }) });
    const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error?.message ?? t("تعذر حفظ الفاتورة", "Could not save invoice")); router.push(`/dashboard/invoices/${invoice.id}`);
  } catch (caught) { setError(caught instanceof Error ? caught.message : t("حدث خطأ", "An error occurred")); } finally { setSaving(false); } }

  if (loading) return <Card><div className="h-72 animate-pulse rounded-2xl bg-white/5" /></Card>;
  if (!invoice) return <Card><p className="text-red-300">{error}</p></Card>;
  const editableLines = invoice.origin === "DIRECT";
  const summary = <Card><h3 className="font-semibold">{t("ملخص الفاتورة", "Invoice summary")}</h3><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between text-slate-400"><dt>{t("قبل الضريبة", "Subtotal")}</dt><dd>{money(totals.subtotal)}</dd></div><div className="flex justify-between text-slate-400"><dt>{t("الضريبة التقديرية", "Estimated tax")}</dt><dd>{money(totals.tax)}</dd></div><div className="flex justify-between border-t border-white/10 pt-4 text-lg font-semibold text-sky-200"><dt>{t("الإجمالي التقديري", "Estimated total")}</dt><dd>{money(totals.total)}</dd></div></dl><p className="mt-4 text-xs text-slate-500">{t("يعيد الخادم التحقق والحساب عند الحفظ.", "The server revalidates and recalculates on save.")}</p><Button className="mt-5 w-full" type="submit" disabled={saving}>{saving ? t("جارٍ الحفظ...", "Saving…") : t("حفظ التعديلات", "Save changes")}</Button></Card>;
  return <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}><Link href={`/dashboard/invoices/${invoice.id}`} className="text-sky-300">{t("العودة للفاتورة", "Back to invoice")}</Link><SectionHeader eyebrow={t("العمليات التجارية", "Commercial operations")} title={`${t("تعديل", "Edit")} ${invoice.number}`} description={t("التعديل متاح للمسودة فقط مع حماية من تعارض الحفظ.", "Editing is draft-only and protected against conflicting saves.")} /><form onSubmit={submit}><CommercialComposer mode="INVOICE" isArabic={isArabic} title={t("مسودة الفاتورة", "Invoice draft")} description={t("راجع التغييرات قبل الحفظ؛ تبقى الحسابات النهائية تحت سلطة الخادم.", "Review changes before saving; final calculations remain server-authoritative.")} summary={summary}>
    {error ? <Card className="border-red-400/20 bg-red-400/5"><p className="text-red-300">{error}</p></Card> : null}
    <ComposerSection title={t("العميل والتواريخ", "Customer & dates")}><div className="grid gap-4 md:grid-cols-2">{editableLines ? <label className="space-y-2"><span className="text-sm text-slate-400">{t("العميل", "Customer")}</span><CustomerPicker customers={customers} value={customerId} isArabic={isArabic} onChange={setCustomerId} onCreated={(customer) => setCustomers((current) => [...current, customer])} /></label> : <Card className="border-amber-400/20 bg-amber-400/5"><p className="text-sm text-amber-100">{t("هوية العميل وبنود مستند المصدر محفوظة ولا تُستبدل بصمت.", "Customer identity and source-document lines are preserved and cannot be silently replaced.")}</p></Card>}<label className="space-y-2"><span className="text-sm text-slate-400">{t("تاريخ الفاتورة", "Invoice date")}</span><Input required type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label><label className="space-y-2"><span className="text-sm text-slate-400">{t("تاريخ الاستحقاق", "Due date")}</span><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label></div></ComposerSection>
    {editableLines ? <ComposerSection title={t("البنود التجارية", "Commercial lines")}><CommercialLineEditor lines={lines} items={items} isArabic={isArabic} currencyCode={invoice.currencyCode} onChange={setLines} /></ComposerSection> : null}
    <ComposerSection title={t("الملاحظات والشروط", "Notes & terms")}><div className="grid gap-4 md:grid-cols-2"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} aria-label={t("ملاحظات", "Notes")} className="min-h-32 rounded-xl border border-white/10 bg-slate-950 p-4" /><textarea value={terms} onChange={(event) => setTerms(event.target.value)} aria-label={t("الشروط التجارية", "Commercial terms")} className="min-h-32 rounded-xl border border-white/10 bg-slate-950 p-4" /></div></ComposerSection>
  </CommercialComposer></form></section>;
}
