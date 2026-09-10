"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";

type SourceKind = "QUOTATION" | "SALES_ORDER";
type SourceOption = { id: string; number: string; customerName: string; total: number; currencyCode: string };
type SourceRecord = { id: string; quotationNumber?: string; number?: string; customer?: { name?: string } | null; totals: { totalAmount: number }; currencyCode: string };
type Props = { kind: SourceKind; value: string; onChange: (id: string) => void; isArabic: boolean };

export function CommercialSourcePicker(props: Props) {
  return <SourcePicker key={props.kind} {...props} />;
}

function SourcePicker({ kind, value, onChange, isArabic }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [options, setOptions] = useState<SourceOption[]>([]);
  const [selected, setSelected] = useState<SourceOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const quotation = kind === "QUOTATION";
  const t = (ar: string, en: string) => isArabic ? ar : en;
  const title = quotation ? t("اختر عرض سعر معتمد", "Select approved quotation") : t("اختر أمر بيع مؤكد", "Select confirmed sales order");
  const searchLabel = quotation ? t("ابحث في عروض الأسعار", "Search quotations") : t("ابحث في أوامر البيع", "Search sales orders");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ status: quotation ? "APPROVED" : "CONFIRMED", search: search.trim(), page: String(page), pageSize: "20", locale: isArabic ? "ar" : "en" });
        const response = await fetch("/api/" + (quotation ? "quotations" : "sales-orders") + "?" + params, { signal: controller.signal });
        if (!response.ok) throw new Error("Commercial source request failed (" + response.status + ")");
        const body = await response.json();
        const records: SourceRecord[] = quotation ? body.data?.quotations : body.data?.salesOrders;
        if (!Array.isArray(records)) throw new Error("Invalid commercial source response");
        const next = records.map(record => ({ id: record.id, number: (quotation ? record.quotationNumber : record.number) || "", customerName: record.customer?.name || "", total: Number(record.totals.totalAmount), currencyCode: record.currencyCode }));
        if (cancelled) return;
        setOptions(next);
        setTotalPages(body.data?.pagination?.totalPages ?? 1);
      } catch (caught) {
        if (cancelled) return;
        console.error("Commercial source load failed", caught);
        setOptions([]);
        setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
  }, [quotation, search, page, isArabic, retry]);

  const label = (source: SourceOption) => [source.number, source.customerName, new Intl.NumberFormat(isArabic ? "ar-KW" : "en-US", { style: "currency", currency: source.currencyCode, minimumFractionDigits: 3 }).format(source.total)].filter(Boolean).join(" · ");
  const selection = selected?.id === value ? selected : null;
  return <div className="space-y-3" dir={isArabic ? "rtl" : "ltr"} role="group" aria-label={title}>
    <p className="text-sm text-slate-400">{title}</p>
    <Input aria-label={searchLabel} placeholder={searchLabel} value={search} onChange={event => { setSearch(event.target.value); setPage(1); setLoading(true); setSelected(null); onChange(""); }} />
    {selection ? <p className="text-sm text-sky-300" role="status">{t("المستند المحدد", "Selected document")}: {label(selection)}</p> : null}
    {loading ? <p role="status" className="text-sm text-slate-400">{t("جارٍ التحميل", "Loading")}</p> : error ? <div role="alert" className="text-sm text-red-300">
      <p>{quotation ? t("تعذر تحميل عروض الأسعار", "Could not load quotations") : t("تعذر تحميل أوامر البيع", "Could not load sales orders")}</p>
      <Button type="button" variant="secondary" onClick={() => { setLoading(true); setRetry(current => current + 1); }}>{t("إعادة المحاولة", "Retry")}</Button>
    </div> : options.length === 0 ? <p role="status" className="text-sm text-slate-400">{quotation ? t("لا توجد عروض أسعار مؤهلة", "No eligible quotations found") : t("لا توجد أوامر بيع مؤهلة", "No eligible sales orders found")}</p> : <ul className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-2">
      {options.map(source => <li key={source.id}><button type="button" aria-pressed={value === source.id} onClick={() => { setSelected(source); onChange(source.id); }} className="block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-white/5 focus-visible:outline focus-visible:outline-sky-400">{label(source)}</button></li>)}
    </ul>}
    {!loading && !error && totalPages > 1 ? <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => { setLoading(true); setPage(current => current - 1); }}>{t("السابق", "Previous")}</Button>
      <span className="text-sm text-slate-500">{page} / {totalPages}</span>
      <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => { setLoading(true); setPage(current => current + 1); }}>{t("التالي", "Next")}</Button>
    </div> : null}
  </div>;
}
