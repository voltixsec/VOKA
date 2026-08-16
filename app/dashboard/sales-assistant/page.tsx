"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import type { SalesAssistantDraftProposal } from "@/src/application/ai-sales-assistant";
import { useVoiceInput, IVoiceRecognizer } from "@/src/infrastructure/voice/browser";

const SAMPLES = [
  {
    labelAr: "طلب كاميرات مراقبة (عربي)",
    labelEn: "CCTV Request (Arabic)",
    text: "اعمل عرض سعر لشركة الكويت الوطنية للاتصالات 5 كاميرات IP بدقة 4K بسعر 45 د.ك مع التركيب والبرمجة",
  },
  {
    labelAr: "طلب توريد أجهزة NVR (إنجليزي)",
    labelEn: "NVR Supply (English)",
    text: "Create a quotation for Gulf Tech Solution supply only 10 units NVR 16 Channels at 120 KWD",
  },
];

export default function SalesAssistantPage(props: any) {
  const customRecognizer: IVoiceRecognizer | undefined = props?.customRecognizer;
  const { isArabic } = useLanguage();
  const router = useRouter();

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SalesAssistantDraftProposal | null>(null);

  const basePromptRef = useRef<string>("");

  const voice = useVoiceInput({
    locale: isArabic ? "ar" : "en",
    recognizer: customRecognizer,
  });

  // Keep track of the transcript final result and merge into prompt
  const prevFinalRef = useRef<string>("");

  useEffect(() => {
    if (voice.transcript.final && voice.transcript.final !== prevFinalRef.current) {
      const newAddition = voice.transcript.final;
      const base = basePromptRef.current;
      const merged = base ? `${base.trim()} ${newAddition.trim()}` : newAddition.trim();
      setPrompt(merged);
      prevFinalRef.current = voice.transcript.final;
    }
  }, [voice.transcript.final]);

  const handleStartListening = () => {
    basePromptRef.current = prompt;
    prevFinalRef.current = "";
    voice.startListening(isArabic ? "ar-KW" : "en-US");
  };

  const handleStopListening = () => {
    voice.stopListening();
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setProposal(null);

    try {
      const response = await fetch("/api/ai/sales-assistant/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          sourceLocale: isArabic ? "ar" : "en",
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error?.message || "Failed to generate AI proposal draft.");
      }

      setProposal(json.data);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyToComposer = () => {
    if (!proposal) return;
    try {
      sessionStorage.setItem("voka_ai_proposal_draft", JSON.stringify(proposal));
      router.push("/dashboard/quotations/new");
    } catch {
      setError("Unable to apply proposal draft to quotation composer.");
    }
  };

  const getVoiceStatusMessage = () => {
    switch (voice.state) {
      case "LISTENING":
        return isArabic
          ? "جاري الاستماع... يرجى التحدث الآن"
          : "Listening... Speak your request now";
      case "PROCESSING":
        return isArabic
          ? "جاري معالجة الصوت وتحويله إلى نص..."
          : "Processing speech to text...";
      case "READY":
        return isArabic
          ? "تم تحويل الصوت إلى نص. يمكنك مراجعته وتعديله قبل التوليد."
          : "Voice converted to text. Review and edit before generating proposal.";
      case "UNAVAILABLE":
        return isArabic
          ? "إدخال الصوت غير مدعوم في هذا المتصفح. يمكنك إدخال النص يدوياً."
          : "Voice input is not supported in this browser. You can type manually.";
      case "PERMISSION_DENIED":
        return isArabic
          ? "تم رفض الإذن لاستخدام الميكروفون. يرجى السماح للوصول للميكروفون في المتصفح."
          : "Microphone permission denied. Please allow microphone access in browser settings.";
      case "ERROR":
        return voice.errorMessage || (isArabic
          ? "حدث خطأ أثناء التعرف على الصوت."
          : "An error occurred during voice recognition.");
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 max-w-5xl" dir={isArabic ? "rtl" : "ltr"}>
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-300">
          {isArabic ? "المساعد الذكي للمبيعات" : "AI Sales Assistant"}
        </p>

        <h2 className="mt-2 text-3xl font-semibold text-white">
          {isArabic ? "مسودة تجارية هيكلية من النص والصوت" : "Structured Commercial Draft from Text & Voice"}
        </h2>

        <p className="mt-2 text-slate-400">
          {isArabic
            ? "تحدث أو أدخل طلب المبيعات باللغة الطبيعية لاستخراج وتدقيق العميل والمنتجات والأسعار وتوليد مسودة مقترحة للمراجعة."
            : "Speak or type a natural language sales request to extract and resolve customer, catalog items, pricing, and generate a proposal draft for human review."}
        </p>
      </div>

      {/* Input Prompt Card */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-soft space-y-4">
        <div className="flex items-center justify-between">
          <label htmlFor="sales-prompt-input" className="block text-sm font-semibold text-slate-200">
            {isArabic ? "طلب المبيعات (اللغة الطبيعية)" : "Sales Request Prompt (Natural Language)"}
          </label>

          {/* Microphone Transport Control */}
          <div className="flex items-center gap-2">
            {voice.state === "LISTENING" || voice.state === "PROCESSING" ? (
              <button
                type="button"
                onClick={handleStopListening}
                aria-label={isArabic ? "إيقاف الاستماع" : "Stop listening"}
                aria-pressed={true}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-500/20 border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 transition animate-pulse"
              >
                <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" strokeWidth="2" fill="currentColor" />
                </svg>
                {isArabic ? "إيقاف الاستماع" : "Stop Listening"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartListening}
                disabled={!voice.isSupported}
                aria-label={isArabic ? "بدء الإدخال الصوتي" : "Start voice input"}
                aria-pressed={false}
                title={
                  !voice.isSupported
                    ? isArabic
                      ? "إدخال الصوت غير مدعوم في هذا المتصفح"
                      : "Voice input is not supported in this browser"
                    : isArabic
                    ? "انقر للتحدث"
                    : "Click to speak"
                }
                className="inline-flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-14 0m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                {isArabic ? "إدخال صوتي" : "Voice Input"}
              </button>
            )}
          </div>
        </div>

        {/* Text Area */}
        <div className="relative">
          <textarea
            id="sales-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder={
              isArabic
                ? "تحدث أو اكتب... مثال: اعمل عرض سعر لشركة الكويت الوطنية للاتصالات 5 كاميرات IP بدقة 4K بسعر 45 د.ك"
                : "Speak or type... e.g. Create a quotation for Gulf Tech Solution supply only 10 units NVR 16 Channels at 120 KWD"
            }
            className="w-full rounded-2xl border border-white/10 bg-slate-950 p-4 text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none text-sm"
          />

          {/* Live Interim Transcript Overlay/Badge */}
          {voice.transcript.interim && (
            <div className="mt-1 rounded-xl bg-sky-950/60 border border-sky-500/20 p-2.5 text-xs text-sky-200 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping" />
              <span className="font-medium">{isArabic ? "جاري الاستماع:" : "Listening:"}</span>
              <span className="italic text-slate-300">{voice.transcript.interim}</span>
            </div>
          )}
        </div>

        {/* Accessible Voice Status Live Region */}
        {getVoiceStatusMessage() && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-2xl p-3 text-xs flex items-center gap-2 ${
              voice.state === "PERMISSION_DENIED" || voice.state === "ERROR"
                ? "border border-rose-500/30 bg-rose-500/10 text-rose-300"
                : voice.state === "UNAVAILABLE"
                ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                : voice.state === "LISTENING" || voice.state === "PROCESSING"
                ? "border border-sky-500/30 bg-sky-500/10 text-sky-300"
                : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              [{voice.state}]
            </span>
            <span>{getVoiceStatusMessage()}</span>
          </div>
        )}

        {/* Sample Prompt Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">
            {isArabic ? "نماذج سريعة:" : "Sample Prompts:"}
          </span>
          {SAMPLES.map((sample, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPrompt(sample.text)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sky-300 hover:bg-white/10 transition"
            >
              {isArabic ? sample.labelAr : sample.labelEn}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50 transition"
          >
            {isGenerating ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                {isArabic ? "جاري استخراج وتدقيق البيانات..." : "Extracting & Resolving Data..."}
              </>
            ) : (
              <>{isArabic ? "توليد مسودة عرض السعر" : "Generate Proposal Draft"}</>
            )}
          </button>
        </div>
      </div>

      {/* Structured Review Panel */}
      {proposal && (
        <div className="space-y-6 rounded-3xl border border-sky-400/20 bg-slate-900/80 p-8 shadow-soft">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <span className="inline-block rounded-full bg-sky-400/10 border border-sky-400/20 px-3 py-1 text-xs font-semibold text-sky-300">
                {isArabic ? "مسودة مقترحة جاهزة للمراجعة" : "Structured Proposal Draft"}
              </span>
              <p className="mt-2 text-xs text-slate-400">{proposal.metadata.confidenceSummary}</p>
            </div>

            <button
              type="button"
              onClick={handleApplyToComposer}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300 transition"
            >
              {isArabic ? "تطبيق على نموذج عرض السعر" : "Apply to Quotation Composer"}
            </button>
          </div>

          {/* Customer Match Card */}
          <div className="rounded-2xl border border-white/10 bg-slate-950 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">
                {isArabic ? "مطابقة العميل" : "Customer Resolution"}
              </span>

              {proposal.customer.status === "MATCHED" ? (
                <span className="rounded-full bg-emerald-400/10 border border-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                  {isArabic ? "عميل مسجل بالشركة" : "Existing Customer Matched"}
                </span>
              ) : proposal.customer.status === "AMBIGUOUS" ? (
                <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-300">
                  {isArabic ? "نتائج متعددة (يتطلب اختيار العميل)" : "Multiple Matches Found"}
                </span>
              ) : (
                <span className="rounded-full bg-sky-400/10 border border-sky-400/20 px-3 py-1 text-xs font-semibold text-sky-300">
                  {isArabic ? "عميل غير مسجل (يتطلب الإنشاء)" : "Unregistered Customer Candidate"}
                </span>
              )}
            </div>

            <p className="text-lg font-bold text-white">
              {proposal.customer.name || proposal.customer.mention || (isArabic ? "غير محدد" : "Unspecified")}
            </p>
            {proposal.customer.email && (
              <p className="text-xs text-slate-400">{proposal.customer.email}</p>
            )}

            {(proposal.customer.candidates ?? []).length > 0 && (
              <div className="mt-3 border-t border-white/10 pt-3 space-y-1 text-xs">
                <p className="text-slate-400 font-semibold">{isArabic ? "المرشحون المتاحون:" : "Matching Candidates:"}</p>
                {(proposal.customer.candidates ?? []).map((c) => (
                  <p key={c.id} className="text-slate-300">• {c.code} - {c.name} ({c.email || "no email"})</p>
                ))}
              </div>
            )}
          </div>

          {/* Proposal Meta Card */}
          <div className="grid gap-4 md:grid-cols-2 rounded-2xl border border-white/10 bg-slate-950 p-5 text-sm">
            <div>
              <p className="text-xs text-slate-400">{isArabic ? "موضوع العرض:" : "Subject:"}</p>
              <p className="font-semibold text-white mt-1">{proposal.proposal.subject || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">{isArabic ? "نطاق العمل:" : "Scope Type:"}</p>
              <p className="font-semibold text-sky-300 mt-1">{proposal.proposal.scopeType || "—"}</p>
            </div>
            {proposal.proposal.brief && (
              <div className="md:col-span-2">
                <p className="text-xs text-slate-400">{isArabic ? "ملخص المشروع:" : "Brief:"}</p>
                <p className="text-slate-300 mt-1">{proposal.proposal.brief}</p>
              </div>
            )}
          </div>

          {/* Lines Table */}
          <div className="rounded-2xl border border-white/10 bg-slate-950 overflow-hidden">
            <div className="p-4 border-b border-white/10 text-xs font-semibold text-slate-400 uppercase">
              {isArabic ? "بنود عرض السعر والمطابقة بالكتالوج" : "BOQ Line Items & Catalog Resolution"}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-white/5 text-xs text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="p-4 text-start">#</th>
                    <th className="p-4 text-start">{isArabic ? "البند" : "Item"}</th>
                    <th className="p-4 text-start">{isArabic ? "الكتالوج" : "Catalog Match"}</th>
                    <th className="p-4 text-center">{isArabic ? "الكمية" : "Qty"}</th>
                    <th className="p-4 text-end">{isArabic ? "السعر المطلوبة" : "Req. Price"}</th>
                    <th className="p-4 text-end">{isArabic ? "السعر المعتمد" : "Canonical Price"}</th>
                    <th className="p-4 text-end">{isArabic ? "الإجمالي" : "Subtotal"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {proposal.lines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition">
                      <td className="p-4 text-slate-500">{idx + 1}</td>
                      <td className="p-4">
                        <p className="font-semibold text-white">{line.itemName}</p>
                        {line.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{line.description}</p>
                        )}
                      </td>
                      <td className="p-4">
                        {line.resolutionStatus === "MATCHED" ? (
                          <span className="inline-block rounded-lg bg-emerald-400/10 text-emerald-300 text-xs px-2.5 py-1">
                            {isArabic ? "مطابق بالكتالوج" : "Matched"}
                          </span>
                        ) : line.resolutionStatus === "AMBIGUOUS" ? (
                          <span className="inline-block rounded-lg bg-amber-400/10 text-amber-300 text-xs px-2.5 py-1">
                            {isArabic ? "نتائج متعددة" : "Ambiguous"}
                          </span>
                        ) : (
                          <span className="inline-block rounded-lg bg-slate-400/10 text-slate-300 text-xs px-2.5 py-1">
                            {isArabic ? "بند مخصص" : "Custom/Missing"}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center font-medium">
                        {line.quantity != null ? `${line.quantity} ${line.unitName || ""}` : (isArabic ? "يتطلب تحديد" : "Unspecified")}
                      </td>
                      <td className="p-4 text-end font-mono text-slate-400">
                        {line.requestedPrice != null ? `${Number(line.requestedPrice).toFixed(3)} ${proposal.proposal?.currencyCode ?? "KWD"}` : "—"}
                      </td>
                      <td className="p-4 text-end font-mono font-bold text-sky-300">
                        {line.unitPrice != null ? `${Number(line.unitPrice).toFixed(3)} ${proposal.proposal?.currencyCode ?? "KWD"}` : (isArabic ? "يتطلب تحديد" : "Unresolved")}
                      </td>
                      <td className="p-4 text-end font-mono font-bold text-white">
                        {line.subtotal != null ? `${Number(line.subtotal).toFixed(3)} ${proposal.proposal?.currencyCode ?? "KWD"}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financials Summary */}
          {proposal.financials ? (
            <div className="flex justify-end">
              <div className="w-72 rounded-2xl border border-white/10 bg-slate-950 p-4 space-y-2 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>{isArabic ? "المجموع الفرعي:" : "Subtotal:"}</span>
                  <span className="font-mono text-white">
                    {proposal.financials.subtotal.toFixed(3)} {proposal.proposal.currencyCode}
                  </span>
                </div>
                {proposal.financials.taxAmount > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>{isArabic ? "الضريبة:" : "Tax:"}</span>
                    <span className="font-mono text-white">
                      {proposal.financials.taxAmount.toFixed(3)} {proposal.proposal.currencyCode}
                    </span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-2 flex justify-between text-base font-bold text-emerald-400">
                  <span>{isArabic ? "الإجمالي الكلي:" : "Total Amount:"}</span>
                  <span className="font-mono">
                    {proposal.financials.totalAmount.toFixed(3)} {proposal.proposal.currencyCode}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-xs text-amber-300">
              {isArabic
                ? "ملاحظة: المبالغ والأسعار غير مكتملة وسوف يتم احتسابها وتدقيقها في نموذج عرض السعر بناءً على البنود والكميات المحددة."
                : "Note: Total amounts are incomplete until prices and quantities are fully specified and reviewed in the quotation composer."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
