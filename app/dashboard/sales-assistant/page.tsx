"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import type { SalesAssistantDraftProposal } from "@/src/application/ai-sales-assistant";
import { useRecordedVoiceInput, useVoiceInput, type AudioTranscriber, type IRawAudioRecorder, type IVoiceRecognizer } from "@/src/infrastructure/voice/browser";
import { VoiceOrb } from "@/components/voice";
import { displayLabel } from "@/lib/i18n/display-labels";
import { EstimateNotice } from "@/components/ai/EstimateNotice";
import { EngineeringQuantityDetails } from "@/components/ai/EngineeringQuantityDetails";
import type { CommercialSelection } from "@/src/application/ai-sales-assistant/dto/AISalesAssistantDto";
import type { ConversationBuildMode, ConversationDocumentMode, ConversationReplySource, WorkingCommercialDraft } from "@/src/application/commercial-conversation";

const CONVERSATION_STORAGE_KEY = "voka_commercial_conversation_draft";

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
  const customAudioRecorder: IRawAudioRecorder | undefined = props?.customAudioRecorder;
  const customTranscribe: AudioTranscriber | undefined = props?.customTranscribe;
  const { isArabic } = useLanguage();
  const router = useRouter();

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SalesAssistantDraftProposal | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [workingDraft, setWorkingDraft] = useState<WorkingCommercialDraft | null>(null);
  const [documentMode, setDocumentMode] = useState<ConversationDocumentMode>("AUTO");
  const [buildMode, setBuildMode] = useState<ConversationBuildMode>("AUTO");
  const [resultStale, setResultStale] = useState(false);

  const replySourceRef = useRef<ConversationReplySource>("TEXT");
  const lastAnalyzedTextRef = useRef("");
  const analysisGeneration = useRef(0);
  const [answerTarget, setAnswerTarget] = useState<string | null>(null);
  useEffect(() => () => { analysisGeneration.current++; }, []);

  const voice = useVoiceInput({
    locale: isArabic ? "ar" : "en",
    recognizer: customRecognizer,
  });
  const recorded = useRecordedVoiceInput({ recorder: customAudioRecorder, transcribe: customTranscribe });

  // Keep track of the transcript final result and merge into prompt
  const prevFinalRef = useRef<string>("");

  useEffect(() => {
    if (recorded.isSupported) return;
    if (voice.transcript.final && voice.transcript.final !== prevFinalRef.current) {
      const previous = prevFinalRef.current;
      const newAddition = voice.transcript.final.startsWith(previous)
        ? voice.transcript.final.slice(previous.length).trim()
        : voice.transcript.final.trim();
      if (newAddition) { setPrompt((visible) => visible.trim() ? `${visible.trim()} ${newAddition}` : newAddition); setResultStale(true); }
      replySourceRef.current = "VOICE";
      prevFinalRef.current = voice.transcript.final;
    }
  }, [recorded.isSupported, voice.transcript.final]);

  const previousRecordingTranscriptRef = useRef("");
  useEffect(() => {
    if (!recorded.transcript || recorded.transcript === previousRecordingTranscriptRef.current) return;
    setPrompt((visible) => visible.trim() ? `${visible.trim()} ${recorded.transcript}` : recorded.transcript);
    setResultStale(true);
    replySourceRef.current = "VOICE";
    previousRecordingTranscriptRef.current = recorded.transcript;
  }, [recorded.transcript]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
      if (stored) {
        const draft = JSON.parse(stored) as WorkingCommercialDraft;
        setWorkingDraft(draft); setPrompt(draft.contextText); lastAnalyzedTextRef.current = draft.contextText;
        setDocumentMode(draft.documentMode ?? "AUTO"); setBuildMode(draft.buildMode ?? "AUTO");
      }
    } catch {
      sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (workingDraft) sessionStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(workingDraft));
  }, [workingDraft]);

  const handleVoiceToggle = () => {
    if (recorded.isSupported) {
      if (recorded.state === "RECORDING") recorded.stopRecording();
      else if (recorded.state !== "TRANSCRIBING") { previousRecordingTranscriptRef.current = ""; void recorded.startRecording(); }
      return;
    }
    if (voice.state === "LISTENING" || voice.state === "PROCESSING") {
      voice.stopListening();
      return;
    }
    prevFinalRef.current = "";
    voice.startListening(isArabic ? "ar-KW" : "en-US");
  };

  const advanceConversation = async (explicitReply?: string, source = replySourceRef.current, selection?: CommercialSelection) => {
    const generation = ++analysisGeneration.current;
    const visibleBefore = prompt.trim();
    const reply = explicitReply ?? (!workingDraft ? visibleBefore : visibleBefore.startsWith(lastAnalyzedTextRef.current) ? visibleBefore.slice(lastAnalyzedTextRef.current.length).trim() || visibleBefore : `Updated request: ${visibleBefore}`);
    if (!reply.trim()) return;

    setIsGenerating(true);
    setError(null);
    setResultStale(true);

    try {
      const response = await fetch("/api/ai/commercial-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: workingDraft,
          reply: reply.trim(),
          replySource: source,
          locale: isArabic ? "ar" : "en",
          attachment: attachment ? { name: attachment.name, type: attachment.type, size: attachment.size } : workingDraft?.attachment,
          documentMode,
          buildMode,
          selection,
          answer: answerTarget && !selection ? { field: answerTarget, value: visibleBefore.startsWith(lastAnalyzedTextRef.current) ? visibleBefore.slice(lastAnalyzedTextRef.current.length).trim() : visibleBefore } : undefined,
        }),
      });
      const json = await response.json();
      if (generation !== analysisGeneration.current) return;
      if (!response.ok) throw new Error(json.error?.message || "Unable to continue the conversation.");
      setWorkingDraft(json.data);
      const nextVisible = explicitReply && source === "CHIP" ? `${visibleBefore}${visibleBefore ? "\n" : ""}${explicitReply}` : visibleBefore;
      if (source === "CHIP") setPrompt(nextVisible);
      lastAnalyzedTextRef.current = nextVisible;
      setResultStale(false);
      replySourceRef.current = "TEXT";
      setAnswerTarget(null);
    } catch (err: any) {
      if (generation !== analysisGeneration.current) return;
      setError(err.message || "An unexpected error occurred.");
    } finally {
      if (generation === analysisGeneration.current) setIsGenerating(false);
    }
  };

  const invalidateSelection = (nextDocument: ConversationDocumentMode, nextBuild: ConversationBuildMode) => {
    analysisGeneration.current++; setIsGenerating(false);
    setDocumentMode(nextDocument); setBuildMode(nextBuild); setWorkingDraft(null); setResultStale(false);
    lastAnalyzedTextRef.current = ""; sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
  };

  const newRequest = () => {
    setAnswerTarget(null);
    analysisGeneration.current++; setIsGenerating(false); recorded.resetRecording(); voice.resetVoiceInput();
    setPrompt(""); setWorkingDraft(null); setAttachment(null); setProposal(null); setError(null); setResultStale(false);
    setDocumentMode("AUTO"); setBuildMode("AUTO"); lastAnalyzedTextRef.current = ""; replySourceRef.current = "TEXT";
    sessionStorage.removeItem(CONVERSATION_STORAGE_KEY); sessionStorage.removeItem("voka_commercial_entry_prompt"); sessionStorage.removeItem("voka_ai_proposal_draft");
  };

  const openForHumanReview = async () => {
    if (!workingDraft || resultStale || workingDraft.missingRequired.length || workingDraft.status !== "READY_FOR_REVIEW") return;
    setIsGenerating(true);
    setError(null);
    try {
      sessionStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(workingDraft));
      sessionStorage.setItem("voka_commercial_entry_prompt", workingDraft.contextText);
      if (workingDraft.operation === "DRAWING_TAKEOFF") {
        if (!attachment) throw new Error(isArabic ? "أعد إرفاق ملف الرسم لفتحه للمراجعة." : "Reattach the drawing file to open it for review.");
        const form = new FormData(); form.set("drawing", attachment); form.set("intent", workingDraft.contextText);
        const response = await fetch("/api/drawing-takeoffs", { method: "POST", body: form });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error?.message || "Unable to register the drawing safely.");
        router.push(`/dashboard/takeoff?sessionId=${encodeURIComponent(body.data.session.id)}`);
        return;
      }
      if (workingDraft.operation === "QUOTATION") {
        if (!workingDraft.canonicalProposal) throw new Error(isArabic ? "المسودة الذكية غير مكتملة." : "The canonical intelligence draft is unavailable.");
        sessionStorage.setItem("voka_ai_proposal_draft", JSON.stringify(workingDraft.canonicalProposal));
      }
      const routes = { QUOTATION: "/dashboard/quotations/new", INVOICE: "/dashboard/invoices/new", CONTRACT: "/dashboard/contracts/new", SALES_ORDER: "/dashboard/quotations" } as const;
      router.push(routes[workingDraft.operation]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open the review form.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyToComposer = () => {
    if (!proposal) return;
    if (proposal.smartSystem && proposal.smartSystem.status !== "COMPLETE") {
      setError(isArabic ? "يجب استكمال مدخلات النظام الحرجة أولاً." : "Complete the critical system inputs before applying the draft.");
      return;
    }
    try {
      sessionStorage.setItem("voka_ai_proposal_draft", JSON.stringify(proposal));
      router.push("/dashboard/quotations/new");
    } catch {
      setError("Unable to apply proposal draft to quotation composer.");
    }
  };

  const getVoiceStatusMessage = () => {
    if (recorded.isSupported) {
      if (recorded.state === "RECORDING") return isArabic ? "جاري تسجيل الصوت... اضغط الميكروفون للإيقاف." : "Recording audio… Press the microphone to stop.";
      if (recorded.state === "TRANSCRIBING") return isArabic ? "جاري تفريغ التسجيل كاملاً..." : "Transcribing the complete recording…";
      if (recorded.state === "READY") return isArabic ? "اكتمل التفريغ. راجع النص وعدّله ثم اضغط فهم العملية." : "Transcription complete. Edit the text, then press Understand.";
      if (recorded.state === "PERMISSION_DENIED" || recorded.state === "ERROR") return recorded.errorMessage;
      return null;
    }
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
    <div className={`space-y-8 max-w-5xl ${isArabic ? "font-[var(--font-cairo)]" : ""}`} dir={isArabic ? "rtl" : "ltr"}>
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-300">
          {isArabic ? "مدخل VOKA التجاري الذكي" : "VOKA Commercial AI Entry"}
        </p>

        <h2 className="mt-2 text-3xl font-semibold text-white">
          {isArabic ? "قل أو اكتب ما تريد إنشاءه" : "Tell VOKA what you want to create"}
        </h2>

        <p className="mt-2 text-slate-400">
          {isArabic
            ? "عرض سعر، فاتورة، عقد، أمر بيع، دفعة أو تحليل مخطط — يفهم VOKA الطلب ثم ينقلك إلى المراجعة الصحيحة دون تنفيذ تلقائي."
            : "Quotation, invoice, contract, sales order, payment, or drawing takeoff—VOKA understands the request and routes it to the right review without automatic execution."}
        </p>
      </div>

      {/* Unified Attach + Text + Voice input */}
      <div className="flex flex-col rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-soft gap-3">
        <div className="flex items-center justify-between">
          <label htmlFor="sales-prompt-input" className="block text-sm font-semibold text-slate-200">
            {isArabic ? "طلب المبيعات (اللغة الطبيعية)" : "Sales Request Prompt (Natural Language)"}
          </label>

        </div>

        {/* Text Area */}
        <div className="relative order-2">
          <textarea
            id="sales-prompt-input"
            value={prompt}
            onChange={(e) => { analysisGeneration.current++; setIsGenerating(false); setPrompt(e.target.value); replySourceRef.current = "TEXT"; if (workingDraft) setResultStale(true); }}
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

        <div className="order-1 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
          <label className="text-xs text-slate-400">{isArabic ? "المستند" : "Document"}<select aria-label={isArabic ? "نوع المستند" : "Document type"} value={documentMode} onChange={(event) => invalidateSelection(event.target.value as ConversationDocumentMode, buildMode)} className="ms-2 rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-slate-100"><option value="AUTO">AUTO</option><option value="QUOTATION">QUOTATION</option><option value="INVOICE">INVOICE</option><option value="CONTRACT">CONTRACT</option><option value="SALES_ORDER">SALES ORDER</option></select></label>
          <label className="text-xs text-slate-400">{isArabic ? "البناء" : "Build"}<select aria-label={isArabic ? "نمط البناء" : "Build mode"} value={buildMode} onChange={(event) => invalidateSelection(documentMode, event.target.value as ConversationBuildMode)} className="ms-2 rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-slate-100"><option value="AUTO">AUTO</option><option value="CATALOG_ONLY">CATALOG ONLY</option><option value="SUPPLY_INSTALL_SYSTEM">SUPPLY + INSTALL SYSTEM</option><option value="DRAWING">DRAWING</option></select></label>
          <label htmlFor="commercial-attachment" className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-sky-200">
            {isArabic ? "إرفاق ملف" : "Attach file"}
          </label>
          <input id="commercial-attachment" aria-label={isArabic ? "إرفاق ملف تجاري" : "Attach commercial file"} type="file" accept="application/pdf,.pdf" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} className="sr-only" />
          {attachment ? <div className="flex min-w-0 flex-1 items-center gap-2 text-sm"><span className="truncate text-slate-300">{attachment.name}</span><button type="button" onClick={() => setAttachment(null)} className="shrink-0 text-rose-300">{isArabic ? "إزالة" : "Remove"}</button></div> : <span className="flex-1 text-xs text-slate-500">{isArabic ? "اكتب أو تحدث، وأرفق رسم PDF عند الحاجة." : "Type or speak, and attach a drawing PDF when needed."}</span>}
          <VoiceOrb state={(recorded.isSupported && recorded.state === "RECORDING") || (!recorded.isSupported && voice.state === "LISTENING") ? "LISTENING" : (recorded.isSupported && recorded.state === "TRANSCRIBING") || (!recorded.isSupported && voice.state === "PROCESSING") ? "PROCESSING" : "IDLE"} label={(recorded.isSupported ? recorded.state === "RECORDING" : voice.state === "LISTENING" || voice.state === "PROCESSING") ? (isArabic ? "إيقاف الميكروفون" : "Stop microphone") : recorded.isSupported ? (isArabic ? "بدء تسجيل الصوت" : "Record voice") : (isArabic ? "بدء الإدخال الصوتي" : "Voice Input")} title={!recorded.isSupported && !voice.isSupported ? (isArabic ? "الإدخال الصوتي غير مدعوم" : "Voice input is not supported") : undefined} disabled={recorded.isSupported ? recorded.state === "TRANSCRIBING" : !voice.isSupported} onClick={handleVoiceToggle} />
          <button type="button" onClick={() => advanceConversation()} disabled={isGenerating || !prompt.trim()} className="min-h-11 rounded-xl bg-sky-400 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{isGenerating ? (isArabic ? "جاري الفهم..." : "Understanding…") : (isArabic ? "فهم العملية" : "Understand")}</button>
          <button type="button" onClick={newRequest} className="min-h-11 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300">{isArabic ? "طلب جديد" : "New Request"}</button>
        </div>

        {recorded.isSupported && (recorded.state === "RECORDING" || recorded.state === "TRANSCRIBING") && <div className="order-2 flex h-10 items-center justify-center gap-1 rounded-xl bg-sky-500/5" aria-label={isArabic ? "موجة التسجيل الصوتي" : "Audio recording waveform"}>{recorded.waveform.map((level, index) => <span key={index} className="w-1 rounded-full bg-sky-400 transition-[height] duration-100" style={{ height: `${Math.max(5, level * 34)}px` }} />)}</div>}

        {/* Accessible Voice Status Live Region */}
        {getVoiceStatusMessage() && (
          <div
            role="status"
            aria-live="polite"
            className={`order-4 rounded-2xl p-3 text-xs flex items-center gap-2 ${
              (recorded.isSupported ? recorded.state === "PERMISSION_DENIED" || recorded.state === "ERROR" : voice.state === "PERMISSION_DENIED" || voice.state === "ERROR")
                ? "border border-rose-500/30 bg-rose-500/10 text-rose-300"
                : !recorded.isSupported && voice.state === "UNAVAILABLE"
                ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                : (recorded.isSupported ? recorded.state === "RECORDING" || recorded.state === "TRANSCRIBING" : voice.state === "LISTENING" || voice.state === "PROCESSING")
                ? "border border-sky-500/30 bg-sky-500/10 text-sky-300"
                : "border border-sky-500/30 bg-sky-500/10 text-sky-300"
            }`}
          >
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              [{(recorded.isSupported ? recorded.state : voice.state) === "READY" ? "TRANSCRIPT_READY" : recorded.isSupported ? recorded.state : voice.state}]
            </span>
            <span>{getVoiceStatusMessage()}</span>
          </div>
        )}

        {/* Sample Prompt Presets */}
        <div className="order-5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">
            {isArabic ? "نماذج سريعة:" : "Sample Prompts:"}
          </span>
          {SAMPLES.map((sample, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setPrompt(sample.text); replySourceRef.current = "TEXT"; if (workingDraft) setResultStale(true); }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sky-300 hover:bg-white/10 transition"
            >
              {isArabic ? sample.labelAr : sample.labelEn}
            </button>
          ))}
        </div>

        {error && (
          <div className="order-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {workingDraft && !resultStale && (
          <div className="order-3 space-y-3 rounded-2xl border border-sky-400/20 bg-slate-950/80 p-4" data-testid="commercial-conversation">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-sky-300">{displayLabel(workingDraft.operation, isArabic ? "ar" : "en")}</p><p className="mt-1 text-xs text-slate-400">{isArabic ? "مسودة محادثة واحدة محفوظة — لن يتم إنشاء أي مستند تلقائياً." : "One saved conversational draft — no document will be created automatically."}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${workingDraft.status === "READY_FOR_REVIEW" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{workingDraft.status === "READY_FOR_REVIEW" ? (isArabic ? "جاهز للمراجعة" : "READY FOR REVIEW") : (isArabic ? "يحتاج معلومات" : "Needs information")}</span></div>
            <p className="text-sm text-slate-200">{isArabic ? "فهمت أنك تريد" : "I understood"}: {displayLabel(workingDraft.operation, isArabic ? "ar" : "en")}{workingDraft.fields.lines.length ? ` — ${workingDraft.fields.lines.map((line) => `${line.quantity ?? ""} ${line.itemName}`.trim()).join(" + ")}` : ""}{workingDraft.fields.customerMention ? ` — ${workingDraft.fields.customerMention}` : ""}.</p>
            {workingDraft.canonicalProposal?.smartSystem && <p className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-2 text-xs text-violet-200">{isArabic ? workingDraft.canonicalProposal.smartSystem.systemNameAr : workingDraft.canonicalProposal.smartSystem.systemNameEn} · {workingDraft.canonicalProposal.smartSystem.status} · {isArabic ? "تمت محاولة مطابقة الكتالوج" : "Catalog resolution attempted"}</p>}
            {workingDraft.missingRequired.length > 0 && <div className="rounded-xl border-2 border-rose-400/50 bg-rose-500/10 p-3"><p className="text-sm font-bold text-rose-200">{isArabic ? "مطلوب للإكمال:" : "REQUIRED TO COMPLETE:"}</p><div className="mt-2 flex flex-wrap gap-2">{workingDraft.missingRequired.map((field) => <button type="button" key={`${field.key}-${field.sourceField ?? ""}`} className="rounded-lg border border-rose-300/40 px-3 py-2 text-sm font-semibold text-white" onClick={() => { setAnswerTarget(field.key === "customer" ? "customerMention" : field.key === "systemInput" ? field.sourceField ?? null : null); document.getElementById("sales-prompt-input")?.focus(); }}>{isArabic ? field.labelAr : field.labelEn}</button>)}</div></div>}
            {workingDraft.canonicalProposal?.estimateNotice && <EstimateNotice isArabic={isArabic} />}
            {workingDraft.canonicalProposal && <EngineeringQuantityDetails lines={workingDraft.canonicalProposal.lines} isArabic={isArabic} />}
            <div className="flex flex-wrap gap-2">{workingDraft.customerResolution?.candidates.map((candidate) => <button type="button" key={candidate.id} disabled={isGenerating} onClick={() => advanceConversation(`العميل ${candidate.name}`, "CHIP", { ...workingDraft.selection, customer: { id: candidate.id, name: candidate.name } })} className="rounded-xl border border-sky-400/30 px-3 py-2 text-sm text-sky-200">{candidate.name}</button>)}</div>
            {workingDraft.canonicalProposal?.lines.filter((line) => line.resolutionStatus === "AMBIGUOUS").map((line) => <div key={line.componentKey ?? line.itemName} className="flex flex-wrap gap-2">{line.catalogCandidates.map((candidate) => <button key={candidate.id} type="button" disabled={isGenerating} onClick={() => advanceConversation(candidate.name, "CHIP", { ...workingDraft.selection, catalog: { ...workingDraft.selection?.catalog, [line.componentKey ?? line.itemName]: { id: candidate.id, name: candidate.name } } })} className="rounded-xl border border-sky-400/30 px-3 py-2 text-xs">{candidate.name}</button>)}</div>)}
            {workingDraft.canonicalProposal && <details className="text-xs text-slate-300"><summary>{isArabic ? "البنود ومصادر الأسعار — مراجعة مطلوبة" : "Lines and price sources — review required"}</summary>{workingDraft.canonicalProposal.lines.map((line, index) => <p key={index} className="mt-2">{line.itemName} · {line.quantity ?? "?"} · {line.unitPrice ?? (isArabic ? "السعر يحتاج مراجعة" : "Price needs review")} {workingDraft.canonicalProposal?.proposal.currencyCode} · {line.priceSource === "AI_ESTIMATED" ? (isArabic ? "تقدير ذكاء اصطناعي غير مؤكد" : "Unverified AI estimate") : line.catalogItemId ? (isArabic ? "من الكتالوج" : "Catalog matched") : (isArabic ? "بند مخصص يحتاج مراجعة" : "Custom line — review required")}</p>)}</details>}
            {workingDraft.clarification && workingDraft.customerResolution?.status !== "AMBIGUOUS" && <p className="text-sm text-white">{isArabic ? workingDraft.clarification.ar : workingDraft.clarification.en}</p>}
            {workingDraft.customerResolution?.status !== "AMBIGUOUS" && <div className="flex flex-wrap gap-2">{workingDraft.clarification?.suggestions.map((chip, index) => <button key={index} type="button" disabled={isGenerating} onClick={() => advanceConversation(chip.reply, "CHIP")} className="rounded-xl border border-sky-400/30 px-3 py-2 text-xs">{isArabic ? chip.ar : chip.en}</button>)}</div>}
            {workingDraft.customerResolution?.status === "NOT_FOUND" && <button type="button" onClick={() => router.push("/dashboard/customers/new")} className="text-start text-xs font-semibold text-sky-300 underline">{isArabic ? "فتح نموذج إنشاء عميل" : "Open create customer form"}</button>}
            {workingDraft.recommended.length > 0 && <p className="text-xs text-slate-500">{isArabic ? "اختياري/موصى به: " : "Optional/recommended: "}{workingDraft.recommended.map((field) => isArabic ? field.labelAr : field.labelEn).join("، ")}</p>}
            {workingDraft.status === "READY_FOR_REVIEW" && <button type="button" onClick={openForHumanReview} disabled={isGenerating} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950">{isArabic ? "فتح للمراجعة البشرية" : "Open for human review"}</button>}
          </div>
        )}
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
              disabled={Boolean(proposal.smartSystem && proposal.smartSystem.status !== "COMPLETE")}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 transition"
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
              <p className="font-semibold text-sky-300 mt-1">{proposal.proposal.scopeType ? displayLabel(proposal.proposal.scopeType, isArabic ? "ar" : "en") : "—"}</p>
            </div>
            {proposal.proposal.brief && (
              <div className="md:col-span-2">
                <p className="text-xs text-slate-400">{isArabic ? "ملخص المشروع:" : "Brief:"}</p>
                <p className="text-slate-300 mt-1">{proposal.proposal.brief}</p>
              </div>
            )}
          </div>

          {proposal.smartSystem && (
            <div className={`rounded-2xl border p-5 ${proposal.smartSystem.status === "COMPLETE" ? "border-sky-400/20 bg-sky-400/5" : "border-amber-400/30 bg-amber-400/10"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-white">
                  {isArabic ? proposal.smartSystem.systemNameAr : proposal.smartSystem.systemNameEn}
                </p>
                <span className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-[11px] font-semibold text-slate-200">
                  {displayLabel(proposal.smartSystem.status, isArabic ? "ar" : "en")}
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {proposal.smartSystem.inputs.map((input) => (
                  <div key={input.name} className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs">
                    <p className="text-slate-400">{isArabic ? input.labelAr : input.labelEn}</p>
                    <p className="mt-1 font-semibold text-white">{input.value == null ? "—" : String(input.value)} {input.unit ?? ""}</p>
                    <span className={input.provenance === "USER_PROVIDED" ? "text-emerald-300" : "text-amber-300"}>
                      {displayLabel(input.provenance, isArabic ? "ar" : "en")}{input.isDefault ? (isArabic ? " — قيمة افتراضية" : " — default") : ""}
                    </span>
                  </div>
                ))}
              </div>
              {proposal.smartSystem.missingInputs.length > 0 && (
                <p className="mt-3 text-xs font-semibold text-amber-200">
                  {isArabic ? "مدخلات مطلوبة: " : "Required inputs: "}{proposal.smartSystem.missingInputs.join(", ")}
                </p>
              )}
              {proposal.smartSystem.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-amber-100">
                  {proposal.smartSystem.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Lines Table */}
          <div className="rounded-2xl border border-white/10 bg-slate-950 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between text-xs font-semibold text-slate-400 uppercase">
              <span>{isArabic ? "بنود عرض السعر والمطابقة بالكتالوج" : "BOQ Line Items & Catalog Resolution"}</span>
              {proposal.smartSystem && (
                <span className="rounded-full bg-sky-400/10 border border-sky-400/30 px-3 py-1 text-sky-300 font-medium normal-case">
                  {isArabic ? `محرّك النظام: ${proposal.smartSystem.systemNameAr}` : `Smart System: ${proposal.smartSystem.systemNameEn}`}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-white/5 text-xs text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="p-4 text-start">#</th>
                    <th className="p-4 text-start">{isArabic ? "البند" : "Item"}</th>
                    <th className="p-4 text-start">{isArabic ? "مصدر الكمية" : "Provenance"}</th>
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
                        {line.provenance === "CALCULATED" ? (
                          <span className="inline-block rounded-lg bg-sky-400/10 text-sky-300 text-[11px] px-2 py-0.5 border border-sky-400/20 font-mono">
                            CALCULATED
                          </span>
                        ) : line.provenance === "USER_PROVIDED" ? (
                          <span className="inline-block rounded-lg bg-emerald-400/10 text-emerald-300 text-[11px] px-2 py-0.5 border border-emerald-400/20 font-mono">
                            USER_PROVIDED
                          </span>
                        ) : line.provenance === "SUGGESTED" ? (
                          <span className="inline-block rounded-lg bg-amber-400/10 text-amber-300 text-[11px] px-2 py-0.5 border border-amber-400/20 font-mono">
                            SUGGESTED
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">—</span>
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
