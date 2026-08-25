"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { SignaturePad } from "./SignaturePad";

type Signatory = { id: string; nameAr: string | null; nameEn: string | null; titleAr: string | null; titleEn: string | null; signatureUrl: string | null; isActive: boolean; isDefault: boolean; allowedDocumentTypes: string[] };
const TYPES = ["QUOTATION", "SALES_ORDER", "CONTRACT", "INVOICE"] as const;

export default function SignatoriesPage() {
  const { isArabic } = useLanguage();
  const [items, setItems] = useState<Signatory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [form, setForm] = useState({ nameAr: "", nameEn: "", titleAr: "", titleEn: "", signatureUrl: "", allowedDocumentTypes: ["QUOTATION"] as string[] });

  const load = async () => {
    const response = await fetch("/api/companies/current/signatories", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message ?? "Unable to load signatories.");
    setItems(payload.data);
  };
  useEffect(() => { load().catch((value) => setError(value.message)); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/companies/current/signatories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, signatureUrl: form.signatureUrl || null, isDefault: items.length === 0 }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Unable to save signatory.");
      setForm({ nameAr: "", nameEn: "", titleAr: "", titleEn: "", signatureUrl: "", allowedDocumentTypes: ["QUOTATION"] });
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to save signatory."); } finally { setBusy(false); }
  };

  const update = async (id: string, data: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/companies/current/signatories/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Unable to update signatory.");
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to update signatory."); } finally { setBusy(false); }
  };

  const asset = (file: File | undefined) => {
    if (!file) return;
    if (!(["image/png", "image/jpeg"].includes(file.type)) || file.size > 500 * 1024) { setError(isArabic ? "يجب أن يكون التوقيع PNG أو JPG وبحد أقصى 500 KB." : "Signature must be PNG or JPG and no larger than 500 KB."); return; }
    const reader = new FileReader(); reader.onload = () => setForm((current) => ({ ...current, signatureUrl: String(reader.result) })); reader.readAsDataURL(file);
  };

  return <main className="mx-auto max-w-6xl space-y-8 p-6 lg:p-10" dir={isArabic ? "rtl" : "ltr"}>
    <div><p className="text-sm font-semibold text-sky-400">{isArabic ? "حوكمة المستندات" : "Document governance"}</p><h1 className="mt-2 text-3xl font-bold">{isArabic ? "المفوّضون بالتوقيع" : "Authorized signatories"}</h1><p className="mt-2 text-slate-400">{isArabic ? "يُحفظ اسم المفوّض وصفته وتوقيعه داخل المستند عند الاعتماد." : "The signatory identity and signature are snapshotted when a document is approved."}</p></div>
    {error ? <div role="alert" className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-200">{error}</div> : null}
    <form onSubmit={submit} className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-bold">{isArabic ? "إضافة مفوّض" : "Add signatory"}</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{([['nameAr','الاسم بالعربية'],['nameEn','Name in English'],['titleAr','الصفة بالعربية'],['titleEn','Title in English']] as const).map(([key,label]) => <label key={key} className="text-sm text-slate-300">{label}<input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" /></label>)}</div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-slate-300">{isArabic ? "رفع صورة التوقيع" : "Upload signature"}<input type="file" accept="image/png,image/jpeg" onChange={(e) => asset(e.target.files?.[0])} className="mt-2 block w-full text-sm" /></label>
        <label className="block text-sm text-slate-300">{isArabic ? "التقاط صورة دون تعديل" : "Capture photo without alteration"}<input type="file" accept="image/png,image/jpeg" capture="environment" onChange={(e) => asset(e.target.files?.[0])} className="mt-2 block w-full text-sm" /></label>
      </div>
      <button type="button" onClick={() => setDrawing((value) => !value)} className="mt-4 rounded-lg border border-sky-700 px-3 py-2 text-sm text-sky-300">{drawing ? (isArabic ? "إغلاق لوحة الرسم" : "Close drawing pad") : (isArabic ? "رسم التوقيع" : "Draw signature")}</button>
      {drawing ? <div className="mt-3"><SignaturePad isArabic={isArabic} onAccept={(signatureUrl) => { setForm({ ...form, signatureUrl }); setDrawing(false); }} /></div> : null}
      {form.signatureUrl ? (
        <div className="mt-4 rounded-xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.signatureUrl} alt={isArabic ? "معاينة التوقيع" : "Signature preview"} className="h-20 max-w-full object-contain" />
        </div>
      ) : null}
      <fieldset className="mt-5"><legend className="text-sm text-slate-300">{isArabic ? "أنواع المستندات المسموحة" : "Allowed document types"}</legend><div className="mt-2 flex flex-wrap gap-4">{TYPES.map((type) => <label key={type} className="flex gap-2 text-sm"><input type="checkbox" checked={form.allowedDocumentTypes.includes(type)} onChange={(e) => setForm({ ...form, allowedDocumentTypes: e.target.checked ? [...form.allowedDocumentTypes, type] : form.allowedDocumentTypes.filter((value) => value !== type) })} />{type}</label>)}</div></fieldset>
      <button disabled={busy} className="mt-6 rounded-xl bg-sky-600 px-5 py-3 font-semibold disabled:opacity-50">{isArabic ? "حفظ المفوّض" : "Save signatory"}</button>
    </form>
    <section className="grid gap-4 md:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{isArabic ? item.nameAr ?? item.nameEn : item.nameEn ?? item.nameAr}</h2><p className="text-sm text-slate-400">{isArabic ? item.titleAr ?? item.titleEn : item.titleEn ?? item.titleAr}</p></div>{item.isDefault ? <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs text-emerald-300">{isArabic ? "افتراضي" : "Default"}</span> : null}</div><p className="mt-3 text-xs text-slate-500">{item.allowedDocumentTypes.join(" · ")}</p><div className="mt-4 flex gap-2">{!item.isDefault && item.isActive ? <button disabled={busy} onClick={() => update(item.id, { isDefault: true })} className="rounded-lg border border-sky-700 px-3 py-2 text-sm text-sky-300">{isArabic ? "تعيين افتراضي" : "Make default"}</button> : null}<button disabled={busy || item.isDefault} onClick={() => update(item.id, { isActive: !item.isActive })} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">{item.isActive ? (isArabic ? "تعطيل" : "Deactivate") : (isArabic ? "تفعيل" : "Activate")}</button></div></article>)}</section>
  </main>;
}
