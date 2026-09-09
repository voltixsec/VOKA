"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { Button, Input, Modal } from "@/components/ui";
import { UNIVERSAL_LIBRARY_SECTORS } from "@/features/universal-library/application/companySectors";
import type { UniversalProduct } from "./UniversalLibraryProductsBrowser";

type Option = { id: string; name: string; nameAr?: string | null; nameEn?: string | null };
type CatalogResult = { id: string; code: string; name: string; salePrice: number | null };
const adoptableTypes = new Set(["PRODUCT", "SERVICE", "ITEM", "SHIPPING", "LABOR", "DISCOUNT", "CUSTOM"]);

export default function UniversalLibraryAdoptionBrowser() {
  const { isArabic } = useLanguage();
  const t = (ar: string, en: string) => isArabic ? ar : en;
  const [items, setItems] = useState<UniversalProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<UniversalProduct | null>(null);
  const [adopted, setAdopted] = useState<Record<string, CatalogResult>>({});
  const [code, setCode] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [unitId, setUnitId] = useState("");
  const [taxRateId, setTaxRateId] = useState("");
  const [units, setUnits] = useState<Option[]>([]);
  const [taxes, setTaxes] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [sectorDraft, setSectorDraft] = useState<string[]>([]);
  const [sectorsReady, setSectorsReady] = useState(false);
  const [sectorError, setSectorError] = useState("");
  const [savingSectors, setSavingSectors] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [modalError, setModalError] = useState("");
  const selectedId = selected?.id;
  const itemName = (item: UniversalProduct) => (isArabic ? item.nameAr : item.nameEn) || item.name;

  async function load(nextCursor?: string, signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/universal-library/items?limit=50&isActive=true${nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ""}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || t("تعذر تحميل المكتبة", "Could not load the library."));
      if (signal?.aborted) return;
      const rows = Array.isArray(body.data) ? body.data as UniversalProduct[] : [];
      setItems(current => nextCursor ? [...current, ...rows.filter(row => !current.some(item => item.id === row.id))] : rows);
      setCursor(body.meta?.nextCursor ?? null);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "Request failed");
    } finally { if (!signal?.aborted) setLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/universal-library/company-sectors", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || t("تعذر تحميل القطاعات", "Could not load sectors."));
        const selected = Array.isArray(body.data?.selected) ? body.data.selected as string[] : [];
        if (!controller.signal.aborted) {
          setSectors(selected);
          setSectorDraft(selected);
          setSectorsReady(true);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setSectorError(caught instanceof Error ? caught.message : "Request failed");
          setSectorsReady(true);
        }
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sectors.length === 0) return;
    const controller = new AbortController();
    void load(undefined, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectors.join(",")]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const id = selectedId;
    void Promise.allSettled([
      fetch(`/api/universal-library/items/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal }).then(async response => {
        if (!response.ok) return;
        const body = await response.json();
        if (!controller.signal.aborted && body.data?.id === id) setSelected(current => current?.id === id ? body.data : current);
      }),
      ...([["/api/units", setUnits], ["/api/tax-rates", setTaxes]] as const).map(async ([url, setter]) => {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json();
        if (!controller.signal.aborted) setter(Array.isArray(body.data) ? body.data : []);
      }),
    ]);
    return () => controller.abort();
  }, [selectedId]);

  function open(item: UniversalProduct) {
    setCode(""); setSalePrice(""); setUnitId(""); setTaxRateId(""); setModalError("");
    setUnits([]); setTaxes([]); setSelected(item);
  }

  async function adopt(event: FormEvent) {
    event.preventDefault();
    if (!selected || submitting.current) return;
    const suppliedPrice = salePrice.trim();
    if (suppliedPrice && (!Number.isFinite(Number(suppliedPrice)) || Number(suppliedPrice) < 0)) {
      setModalError(t("أدخل سعرًا صالحًا غير سالب", "Enter a valid non-negative price.")); return;
    }
    const payload = {
      ...(code.trim() ? { code: code.trim() } : {}),
      ...(suppliedPrice ? { salePrice: Number(suppliedPrice) } : {}),
      ...(unitId ? { unitId } : {}),
      ...(taxRateId ? { taxRateId } : {}),
    };
    submitting.current = true; setSaving(true); setModalError("");
    try {
      const response = await fetch(`/api/universal-library/items/${encodeURIComponent(selected.id)}/adopt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok || !body.data?.catalogItem?.id) throw new Error(body.error?.message || t("تعذرت إضافة الصنف", "Could not add the item."));
      setAdopted(current => ({ ...current, [selected.id]: body.data.catalogItem }));
      setSelected(null);
    } catch (caught) { setModalError(caught instanceof Error ? caught.message : "Request failed"); }
    finally { submitting.current = false; setSaving(false); }
  }

  async function saveSectors() {
    try {
      setSavingSectors(true);
      setSectorError("");
      const response = await fetch("/api/universal-library/company-sectors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorCodes: sectorDraft }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || t("تعذر حفظ القطاعات", "Could not save sectors."));
      setSectors(Array.isArray(body.data?.selected) ? body.data.selected : sectorDraft);
    } catch (caught) {
      setSectorError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setSavingSectors(false);
    }
  }

  function toggleSector(code: string) {
    setSectorDraft((current) => {
      if (current.includes(code)) return current.filter((item) => item !== code);
      if (current.length >= 3) return current;
      return [...current, code];
    });
  }

  return <section dir={isArabic ? "rtl" : "ltr"} className="space-y-6">
    <Link href="/dashboard/products" className="text-sky-300">{t("كتالوج الشركة", "Company Catalog")}</Link>
    <h1 className="text-3xl font-bold">{t("المكتبة العالمية", "Universal Library")}</h1>
    <p className="text-slate-400">{t("ثبّت قطاعاً واحداً على الأقل وثلاثة كحد أقصى. لا يتم نسخ أصناف المكتبة بالجملة إلى كتالوج الشركة.", "Install at least one sector and at most three. Library items are not mass-copied into Company Catalog.")}</p>
    <div className="grid gap-3 md:grid-cols-3">
      {UNIVERSAL_LIBRARY_SECTORS.map((sector) => {
        const on = sectorDraft.includes(sector.code);
        return (
          <button
            key={sector.code}
            type="button"
            onClick={() => toggleSector(sector.code)}
            className={`rounded-xl border p-4 text-start ${on ? "border-sky-400 bg-sky-950" : "border-white/10 bg-slate-900"}`}
          >
            {isArabic ? sector.ar : sector.en}
          </button>
        );
      })}
    </div>
    {sectorError ? <p role="alert" className="text-red-300">{sectorError}</p> : null}
    <Button type="button" disabled={savingSectors || sectorDraft.length < 1} onClick={() => void saveSectors()}>
      {t("تثبيت القطاعات", "Install sectors")}
    </Button>
    {!sectorsReady ? <p role="status">{t("جارٍ التحميل…", "Loading…")}</p> : null}
    {sectors.length === 0 ? <p className="text-slate-400">{t("اختر قطاعات شركتك أولاً لتصفح الأصناف.", "Choose your company sectors first to browse items.")}</p> : null}
    {sectors.length > 0 && error && <div role="alert">{error} <Button onClick={() => void load()}>{t("إعادة المحاولة", "Retry")}</Button></div>}
    {sectors.length > 0 && loading && <p role="status">{t("جارٍ التحميل…", "Loading…")}</p>}
    {sectors.length > 0 && !loading && !error && items.length === 0 && <p>{t("لا توجد أصناف منشورة", "No published items yet.")}</p>}
    <div className="grid gap-4 md:grid-cols-2">{items.map(item => {
      const result = adopted[item.id];
      return <article key={item.id} className="space-y-3 rounded-xl border border-white/10 bg-slate-900 p-5">
        <h2 className="text-lg font-semibold">{itemName(item)}</h2>
        <p className="text-sm text-slate-400">{[item.manufacturer?.name, item.brand?.name, item.family?.name].filter(Boolean).join(" · ")}</p>
        {item.modelNumber && <p>{t("الموديل", "Model")}: {item.modelNumber}</p>}
        {item.identifiers?.map(identifier => <p key={identifier.id} className="text-sm">{identifier.identifierType}: {identifier.value}</p>)}
        {!!item.provenances?.length && <p className="text-sm text-slate-400">{t("مصادر الإثبات", "Evidence sources")}: {item.provenances.map(p => p.source?.name).filter(Boolean).join(" · ") || item.provenances.length}</p>}
        {result ? <div role="status" className="space-y-1 text-emerald-300">
          <p>{t("أُضيف إلى كتالوج الشركة", "Added to Company Catalog")}</p>
          <p>{result.name} · {result.code}</p>
          <p>{result.salePrice === null ? t("السعر غير محدد", "Price not set") : result.salePrice.toFixed(3)}</p>
          <Link href="/dashboard/products" className="underline">{t("فتح كتالوج الشركة", "Open Company Catalog")}</Link>
        </div> : adoptableTypes.has(item.type) && item.isActive ? <Button onClick={() => open(item)}>{t("إضافة إلى كتالوج الشركة", "Add to Company Catalog")}</Button> : <p className="text-sm text-slate-400">{t("للاطلاع فقط", "Reference only")}</p>}
      </article>;
    })}</div>
    {cursor && <Button disabled={loading} onClick={() => void load(cursor)}>{t("تحميل المزيد", "Load more")}</Button>}
    <Modal open={!!selected} title={selected ? itemName(selected) : ""} onClose={() => { if (!saving) setSelected(null); }} closeLabel={t("إغلاق", "Close modal")}>
      <form onSubmit={adopt} className="space-y-4">
        <p className="text-sm text-slate-400">{t("اترك السعر فارغًا إذا لم يُحدد. الصفر سعر صريح.", "Leave the price blank if it is not set. Zero is an explicit price.")}</p>
        {selected?.identifiers?.map(identifier => <p key={identifier.id}>{identifier.identifierType}: {identifier.value}</p>)}
        {selected?.provenances?.map(provenance => <p key={provenance.id} className="text-sm text-slate-400">{t("مصدر الإثبات", "Evidence source")}: {provenance.source?.name || provenance.externalRef || t("مصدر مسجل", "Recorded source")}</p>)}
        <label className="block">{t("الكود (اختياري)", "Code (optional)")}<Input value={code} onChange={event => setCode(event.target.value)} disabled={saving} /></label>
        <label className="block">{t("سعر البيع (اختياري)", "Sale Price (optional)")}<Input type="number" min="0" step="0.001" value={salePrice} onChange={event => setSalePrice(event.target.value)} disabled={saving} /></label>
        {([[units, unitId, setUnitId, t("الوحدة (اختياري)", "Unit (optional)")], [taxes, taxRateId, setTaxRateId, t("الضريبة (اختياري)", "Tax (optional)")]] as const).map(([options, value, setter, label]) => options.length > 0 && <label key={label} className="block">{label}<select value={value} onChange={event => setter(event.target.value)} disabled={saving} className="block w-full rounded-lg bg-slate-800 p-2"><option value="">{t("غير محدد", "Not set")}</option>{options.map(option => <option key={option.id} value={option.id}>{(isArabic ? option.nameAr : option.nameEn) || option.name}</option>)}</select></label>)}
        {modalError && <p role="alert" className="text-red-300">{modalError}</p>}
        <Button type="submit" disabled={saving}>{saving ? t("جارٍ الإضافة…", "Adding…") : t("إضافة إلى كتالوج الشركة", "Add to Company Catalog")}</Button>
      </form>
    </Modal>
  </section>;
}
