"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { Button, Card, Input, LocalizedFileInput, SectionHeader } from "@/components/ui";
import { displayLabel } from "@/lib/i18n/display-labels";

type Provenance = "USER_PROVIDED" | "DRAWING_COUNTED" | "NEEDS_CONFIRMATION";
type Line = { itemName: string; quantity: string; unitName: string; provenance: Provenance; isConfirmed: boolean };
type Session = { id: string; sourceFileName: string; userIntent: string; status: string; version: number; quotationId: string | null; createdAt: string; lines: Array<Line & { id: string }> };
const emptyLine = (): Line => ({ itemName: "", quantity: "", unitName: "each", provenance: "NEEDS_CONFIRMATION", isConfirmed: false });

export default function TakeoffPage() {
  const { isArabic } = useLanguage();
  const locale = isArabic ? "ar" : "en";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [intent, setIntent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [line, setLine] = useState<Line>(emptyLine());
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [active, setActive] = useState<Session | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/drawing-takeoffs", { cache: "no-store" }); if (response.ok) setSessions((await response.json()).data.sessions); }, []);
  useEffect(() => { void load(); }, [load]);

  function selectSession(session: Session) {
    setActive(session);
    const first = session.lines[0];
    setEditingLineId(first?.id ?? null);
    setLine(first ? { itemName: first.itemName, quantity: String(first.quantity ?? ""), unitName: first.unitName ?? "", provenance: first.provenance, isConfirmed: first.isConfirmed } : emptyLine());
  }

  function selectLine(next: Session["lines"][number]) {
    setEditingLineId(next.id);
    setLine({ itemName: next.itemName, quantity: String(next.quantity ?? ""), unitName: next.unitName ?? "", provenance: next.provenance, isConfirmed: next.isConfirmed });
  }

  async function upload(event: FormEvent) {
    event.preventDefault(); setMessage(""); if (!file) return;
    const form = new FormData(); form.set("drawing", file); form.set("intent", intent);
    const response = await fetch("/api/drawing-takeoffs", { method: "POST", body: form }); const json = await response.json();
    if (!response.ok) return setMessage(json.error?.message ?? (isArabic ? "تعذر بدء التحليل" : "Analysis could not start"));
    selectSession(json.data.session); setMessage(isArabic ? "تم استلام الرسم بأمان. راجع الكميات قبل تأكيدها." : "Drawing received safely. Review quantities before confirming them."); await load();
  }

  async function save(confirm: boolean) {
    if (!active) return;
    const lines = active.lines.length
      ? active.lines.map((existing) => existing.id === editingLineId
        ? { ...line }
        : { itemName: existing.itemName, quantity: existing.quantity, unitName: existing.unitName, provenance: existing.provenance, isConfirmed: existing.isConfirmed })
      : [{ ...line }];
    const response = await fetch(`/api/drawing-takeoffs/${active.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: active.version, lines, confirm }) }); const json = await response.json();
    if (!response.ok) return setMessage(json.error?.message ?? (isArabic ? "تعذر الحفظ" : "Save failed"));
    const nextSession = json.data.session as Session;
    const editedIndex = active.lines.findIndex((candidate) => candidate.id === editingLineId);
    setActive(nextSession);
    setEditingLineId(nextSession.lines[editedIndex]?.id ?? nextSession.lines[0]?.id ?? null);
    setMessage(confirm ? (isArabic ? "تم تأكيد الحصر." : "Takeoff confirmed.") : (isArabic ? "تم حفظ مسودة المراجعة." : "Review draft saved.")); await load();
  }

  async function openQuotationDraft() {
    if (!active || active.status !== "CONFIRMED") return;
    setMessage("");
    const response = await fetch(`/api/drawing-takeoffs/${encodeURIComponent(active.id)}/quotation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
    const json = await response.json().catch(() => null);
    if (!response.ok || typeof json?.data?.navigationTarget !== "string") return setMessage(json?.error?.message ?? (isArabic ? "تعذر تجهيز مسودة العرض." : "Quotation draft could not be prepared."));
    window.location.href = json.data.navigationTarget;
  }

  return <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
    <SectionHeader eyebrow={isArabic ? "ذكاء الرسومات" : "Drawing intelligence"} title={isArabic ? "تحليل الرسم وإعداد الحصر" : "Analyze drawing & prepare takeoff"} description={isArabic ? "ارفع الرسم وحدد ما تريد بيعه. لا تصبح أي كمية مؤكدة قبل مراجعتك الصريحة." : "Upload the drawing and state what you need to sell. No quantity becomes confirmed without your explicit review."} />
    <Card><form onSubmit={upload} className="space-y-4"><LocalizedFileInput isArabic={isArabic} label={isArabic ? "ملف الرسم بصيغة PDF" : "PDF drawing"} required accept="application/pdf,.pdf" onFile={(selected) => setFile(selected ?? null)} /><Input required value={intent} onChange={(event) => setIntent(event.target.value)} placeholder={isArabic ? "مثال: احصر كاميرات CCTV فقط" : "Example: Count CCTV cameras only"} /><Button type="submit">{isArabic ? "بدء التحليل" : "Start analysis"}</Button></form></Card>
    {message ? <Card padding="sm"><p className="text-sm text-amber-200">{message}</p></Card> : null}
    {active ? <Card><h2 className="font-semibold">{isArabic ? "مراجعة بند الحصر" : "Review takeoff line"}</h2><p className="mt-2 text-xs text-slate-500">{active.sourceFileName} · v{active.version}</p><div className="mt-3 flex flex-wrap gap-2"><a className="rounded-xl border border-sky-500/40 px-3 py-2 text-sm text-sky-200" href={`/api/drawing-takeoffs/${encodeURIComponent(active.id)}/pdf`}>{isArabic ? "ملف الحصر PDF" : "Takeoff PDF"}</a><a className="rounded-xl border border-sky-500/40 px-3 py-2 text-sm text-sky-200" href={`/api/drawing-takeoffs/${encodeURIComponent(active.id)}/xlsx`}>{isArabic ? "ملف الحصر Excel" : "Takeoff Excel"}</a>{active.status === "CONVERTED" && active.quotationId ? <a className="rounded-xl border border-emerald-400/40 px-3 py-2 text-sm text-emerald-200" href={`/dashboard/quotations/${encodeURIComponent(active.quotationId)}/edit`}>{isArabic ? "فتح مسودة العرض" : "Open quotation draft"}</a> : <button type="button" disabled={active.status !== "CONFIRMED"} onClick={() => void openQuotationDraft()} className="rounded-xl border border-emerald-400/40 px-3 py-2 text-sm text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50">{isArabic ? "إنشاء مسودة عرض من الحصر" : "Open quotation draft from takeoff"}</button>}</div>{active.lines.length > 1 ? <div className="mt-4 flex flex-wrap gap-2" aria-label={isArabic ? "بنود الحصر" : "Takeoff lines"}>{active.lines.map((candidate, index) => <button key={candidate.id} type="button" onClick={() => selectLine(candidate)} className={`rounded-lg border px-2.5 py-1.5 text-xs ${candidate.id === editingLineId ? "border-sky-400/60 text-sky-200" : "border-white/10 text-slate-400"}`}>{index + 1}. {candidate.itemName || (isArabic ? "بند بلا اسم" : "Unnamed line")}</button>)}</div> : null}<div className="mt-4 grid gap-3 md:grid-cols-4"><Input value={line.itemName} onChange={(event) => setLine({ ...line, itemName: event.target.value })} placeholder={isArabic ? "اسم البند" : "Item name"} /><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setLine({ ...line, quantity: event.target.value })} placeholder={isArabic ? "الكمية" : "Quantity"} /><Input value={line.unitName} onChange={(event) => setLine({ ...line, unitName: event.target.value })} placeholder={isArabic ? "الوحدة" : "Unit"} /><select aria-label={isArabic ? "مصدر الكمية" : "Quantity source"} value={line.provenance} onChange={(event) => setLine({ ...line, provenance: event.target.value as Provenance, isConfirmed: false })} className="rounded-xl border border-white/10 bg-slate-950 px-3">{(["NEEDS_CONFIRMATION", "USER_PROVIDED", "DRAWING_COUNTED"] as Provenance[]).map((value) => <option key={value} value={value}>{displayLabel(value, locale)}</option>)}</select></div><label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={line.isConfirmed} onChange={(event) => setLine({ ...line, isConfirmed: event.target.checked })} />{isArabic ? "راجعت الكمية وأؤكدها" : "I reviewed and confirm this quantity"}</label><div className="mt-4 flex gap-3"><Button variant="secondary" onClick={() => void save(false)}>{isArabic ? "حفظ للمراجعة" : "Save for review"}</Button><Button disabled={!line.isConfirmed} onClick={() => void save(true)}>{isArabic ? "تأكيد الحصر" : "Confirm takeoff"}</Button></div></Card> : null}
    <Card><h2 className="font-semibold">{isArabic ? "الجلسات الأخيرة" : "Recent sessions"}</h2><div className="mt-3 space-y-2">{sessions.map((session) => <button key={session.id} type="button" onClick={() => selectSession(session)} className="flex w-full justify-between rounded-xl border border-white/10 p-3 text-start"><span>{session.sourceFileName}<small className="block text-slate-500">{session.userIntent}</small></span><span className="text-xs text-sky-300">{displayLabel(session.status, locale)}</span></button>)}</div></Card>
  </section>;
}
