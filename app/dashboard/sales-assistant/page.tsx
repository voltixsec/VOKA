"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { useRecordedVoiceInput, useVoiceInput, type AudioTranscriber, type IRawAudioRecorder, type IVoiceRecognizer } from "@/src/infrastructure/voice/browser";
import { displayLabel } from "@/lib/i18n/display-labels";
import { EstimateNotice } from "@/components/ai/EstimateNotice";
import { ActiveFieldQuestion } from "@/components/ai/ActiveFieldQuestion";
import { CommercialCatalogChoices } from "@/components/ai/CommercialCatalogChoices";
import { EngineeringQuantityDetails, commercialLineName, engineeringReviewLines } from "@/components/ai/EngineeringQuantityDetails";
import type { CommercialSelection } from "@/src/application/ai-sales-assistant/dto/AISalesAssistantDto";
import type { ConversationBuildMode, ConversationDocumentMode, ConversationReplySource, WorkingCommercialDraft } from "@/src/application/commercial-conversation";
import type { FieldAnswer } from "@/src/application/commercial-conversation";
import { commercialPhase, fieldTarget } from "@/src/application/commercial-conversation/field-completion";

const CONVERSATION_STORAGE_KEY = "voka_commercial_conversation_draft";

const SAMPLES = [
  {
    labelAr: "طلب كاميرات مراقبة",
    labelEn: "CCTV request",
    textAr: "اعمل عرض سعر لشركة الكويت الوطنية للاتصالات 5 كاميرات IP بدقة 4K بسعر 45 د.ك مع التركيب والبرمجة",
    textEn: "Create a quotation for Kuwait National Telecom for 5 IP cameras at 4K resolution, 45 KWD each, with installation and programming",
  },
  {
    labelAr: "طلب توريد أجهزة NVR",
    labelEn: "NVR supply",
    textAr: "اعمل عرض سعر لشركة جلف تك لتوريد 10 أجهزة NVR سعة 16 قناة بسعر 120 د.ك للجهاز",
    textEn: "Create a quotation for Gulf Tech Solution supply only 10 units NVR 16 Channels at 120 KWD",
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
  const [error, setError] = useState<"analysis" | "review" | "reattach" | null>(null);
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
  const recordedTranscriptHandlerRef = useRef<(text: string) => void>(() => undefined);
  const previousRecordingTranscriptRef = useRef("");
  const transcriptionHints = [workingDraft?.activeQuestion ? (isArabic ? workingDraft.activeQuestion.ar : workingDraft.activeQuestion.en) : "", "IP NVR DVR PoE RJ45 CAT6 4MP 8MP H.265 PTZ"];
  const recorded = useRecordedVoiceInput({ recorder: customAudioRecorder, transcribe: customTranscribe, contextHints: transcriptionHints, onTranscript: (text) => recordedTranscriptHandlerRef.current(text) });

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

  const voiceCapabilityKnown = Boolean(recorded.capabilityKnown && voice.capabilityKnown);
  const isListening = voiceCapabilityKnown && (recorded.isSupported ? recorded.state === "RECORDING" : voice.state === "LISTENING");
  const isVoiceProcessing = voiceCapabilityKnown && (recorded.isSupported ? recorded.state === "TRANSCRIBING" : voice.state === "PROCESSING");
  const voiceUnavailable = voiceCapabilityKnown && !recorded.isSupported && !voice.isSupported;
  const hasTextToProcess = Boolean(prompt.trim());
  const primaryActionLabel = isGenerating || isVoiceProcessing
    ? (isArabic ? "جارٍ الفهم..." : "Understanding...")
    : isListening
      ? (isArabic ? "إيقاف وإرسال" : "Stop & Send")
      : hasTextToProcess
        ? (isArabic ? "ابدأ الطلب" : "Start Request")
        : (isArabic ? "ابدأ الطلب صوتيًا" : "Start by Voice");

  const handlePrimaryAction = () => {
    if (isGenerating || isVoiceProcessing) return;
    if (isListening || !hasTextToProcess) { handleVoiceToggle(); return; }
    replySourceRef.current = "TEXT";
    void advanceConversation();
  };

  const advanceConversation = async (explicitReply?: string, source = replySourceRef.current, selection?: CommercialSelection, fieldAnswer?: FieldAnswer) => {
    const generation = ++analysisGeneration.current;
    const visibleBefore = prompt.trim();
    const reply = explicitReply ?? (workingDraft && visibleBefore.startsWith(lastAnalyzedTextRef.current) ? visibleBefore.slice(lastAnalyzedTextRef.current.length).trim() || visibleBefore : visibleBefore);
    const reanalyze = !explicitReply && Boolean(workingDraft) && visibleBefore === lastAnalyzedTextRef.current;
    const target = answerTarget ?? workingDraft?.activeQuestion?.field;
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
          reanalyze,
          answer: fieldAnswer ?? (target && !selection && !reanalyze ? { field: target, value: reply } : undefined),
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
    } catch {
      if (generation !== analysisGeneration.current) return;
      setError("analysis");
    } finally {
      if (generation === analysisGeneration.current) setIsGenerating(false);
    }
  };
  recordedTranscriptHandlerRef.current = (text) => {
    if (!text || text === previousRecordingTranscriptRef.current) return;
    setPrompt((visible) => visible.trim() ? `${visible.trim()} ${text}` : text);
    setResultStale(true);
    replySourceRef.current = "VOICE";
    previousRecordingTranscriptRef.current = text;
    void advanceConversation(text, "VOICE");
  };

  const invalidateSelection = (nextDocument: ConversationDocumentMode, nextBuild: ConversationBuildMode) => {
    analysisGeneration.current++; setIsGenerating(false);
    setDocumentMode(nextDocument); setBuildMode(nextBuild); setWorkingDraft(null); setResultStale(false);
    lastAnalyzedTextRef.current = ""; sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
  };

  const newRequest = () => {
    setAnswerTarget(null);
    analysisGeneration.current++; setIsGenerating(false); recorded.resetRecording(); voice.resetVoiceInput();
    setPrompt(""); setWorkingDraft(null); setAttachment(null); setError(null); setResultStale(false);
    setDocumentMode("AUTO"); setBuildMode("AUTO"); lastAnalyzedTextRef.current = ""; replySourceRef.current = "TEXT";
    sessionStorage.removeItem(CONVERSATION_STORAGE_KEY); sessionStorage.removeItem("voka_commercial_entry_prompt"); sessionStorage.removeItem("voka_ai_proposal_draft");
  };

  const openForHumanReview = async (draft = workingDraft) => {
    if (!draft || resultStale || draft.missingRequired.length || draft.status !== "READY_FOR_REVIEW") return;
    setIsGenerating(true);
    setError(null);
    try {
      sessionStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(draft));
      sessionStorage.setItem("voka_commercial_entry_prompt", draft.contextText);
      if (draft.operation === "DRAWING_TAKEOFF") {
        if (!attachment) { setError("reattach"); return; }
        const form = new FormData(); form.set("drawing", attachment); form.set("intent", draft.contextText);
        const response = await fetch("/api/drawing-takeoffs", { method: "POST", body: form });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error?.message || "Unable to register the drawing safely.");
        router.push(`/dashboard/takeoff?sessionId=${encodeURIComponent(body.data.session.id)}`);
        return;
      }
      if (draft.operation === "QUOTATION") {
        if (!draft.canonicalProposal) throw new Error(isArabic ? "المسودة الذكية غير مكتملة." : "The canonical intelligence draft is unavailable.");
        sessionStorage.setItem("voka_ai_proposal_draft", JSON.stringify(draft.canonicalProposal));
      }
      const routes = { QUOTATION: "/dashboard/quotations/new", INVOICE: "/dashboard/invoices/new", CONTRACT: "/dashboard/contracts/new", SALES_ORDER: "/dashboard/quotations" } as const;
      router.push(routes[draft.operation]);
    } catch {
      setError("review");
    } finally {
      setIsGenerating(false);
    }
  };

  const getVoiceStatusMessage = () => {
    if (recorded.isSupported) {
      if (recorded.state === "RECORDING") return isArabic ? "جاري تسجيل الصوت... اضغط الميكروفون للإيقاف." : "Recording audio… Press the microphone to stop.";
      if (recorded.state === "TRANSCRIBING") return isArabic ? "جاري تفريغ التسجيل كاملاً..." : "Transcribing the complete recording…";
      if (recorded.state === "READY") return isArabic ? "اكتمل التفريغ والفهم. يمكنك مراجعة النص وتعديله." : "Transcription and understanding complete. You can review and edit the text.";
      if (recorded.state === "PERMISSION_DENIED") return isArabic ? "يرجى السماح بالوصول إلى الميكروفون في إعدادات المتصفح." : "Please allow microphone access in browser settings.";
      if (recorded.state === "ERROR") return isArabic ? "تعذر تسجيل الصوت أو تفريغه. حاول مرة أخرى أو اكتب طلبك." : "Audio recording or transcription failed. Try again or type your request.";
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
        return (isArabic
          ? "حدث خطأ أثناء التعرف على الصوت."
          : "An error occurred during voice recognition.");
      default:
        return null;
    }
  };

  return (
    <div className={`space-y-4 max-w-5xl min-w-0 ${isArabic ? "font-[var(--font-cairo)]" : ""}`} dir={isArabic ? "rtl" : "ltr"}>
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-300">
          {isArabic ? "مدخل فوكا التجاري الذكي" : "VOKA Commercial AI Entry"}
        </p>

        <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
          {isArabic ? "قل أو اكتب ما تريد إنشاءه" : "Tell VOKA what you want to create"}
        </h2>

        <p className="mt-2 text-slate-400">
          {isArabic
            ? "صف طلبك، ثم راجع المسودة قبل إنشاء أي مستند."
            : "Describe your request, then review the draft before any document is created."}
        </p>
      </div>

      {/* Unified Attach + Text + Voice input */}
      <div data-testid="commercial-composer" data-commercial-state={commercialPhase(workingDraft, isGenerating, resultStale)} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-white/10 bg-slate-900/70 p-3 shadow-soft sm:p-4">
        <div className="sr-only">
          <label htmlFor="sales-prompt-input" className="sr-only">
            {isArabic ? "طلب المبيعات (اللغة الطبيعية)" : "Sales Request Prompt (Natural Language)"}
          </label>

        </div>

        <div data-testid="commercial-composer-controls" className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="flex min-w-0 basis-[calc(50%-0.25rem)] flex-col gap-1 text-xs text-slate-400 sm:basis-auto sm:flex-none sm:flex-row sm:items-center sm:gap-2">{isArabic ? "المستند" : "Document"}<select aria-label={isArabic ? "نوع المستند" : "Document type"} value={documentMode} onChange={(event) => invalidateSelection(event.target.value as ConversationDocumentMode, buildMode)} className="min-h-11 w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-slate-100 sm:w-auto"><option value="AUTO">{displayLabel("AUTO", isArabic ? "ar" : "en")}</option><option value="QUOTATION">{displayLabel("QUOTATION", isArabic ? "ar" : "en")}</option><option value="INVOICE">{displayLabel("INVOICE", isArabic ? "ar" : "en")}</option><option value="CONTRACT">{displayLabel("CONTRACT", isArabic ? "ar" : "en")}</option><option value="SALES_ORDER">{displayLabel("SALES_ORDER", isArabic ? "ar" : "en")}</option></select></label>
          <label className="flex min-w-0 basis-[calc(50%-0.25rem)] flex-col gap-1 text-xs text-slate-400 sm:basis-auto sm:flex-none sm:flex-row sm:items-center sm:gap-2">{isArabic ? "البناء" : "Build"}<select aria-label={isArabic ? "نمط البناء" : "Build mode"} value={buildMode} onChange={(event) => invalidateSelection(documentMode, event.target.value as ConversationBuildMode)} className="min-h-11 w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-slate-100 sm:w-auto"><option value="AUTO">{displayLabel("AUTO", isArabic ? "ar" : "en")}</option><option value="CATALOG_ONLY">{displayLabel("CATALOG_ONLY", isArabic ? "ar" : "en")}</option><option value="SUPPLY_INSTALL_SYSTEM">{displayLabel("SUPPLY_INSTALL_SYSTEM", isArabic ? "ar" : "en")}</option><option value="DRAWING">{displayLabel("DRAWING", isArabic ? "ar" : "en")}</option></select></label>
          <label htmlFor="commercial-attachment" className="inline-flex min-h-11 items-center cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-sky-200">
            {isArabic ? "إرفاق ملف" : "Attach file"}
          </label>
          <input id="commercial-attachment" aria-label={isArabic ? "إرفاق ملف تجاري" : "Attach commercial file"} type="file" accept="application/pdf,.pdf" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} className="sr-only" />
          {attachment ? <div className="flex w-full min-w-0 items-center gap-2 text-sm sm:w-auto sm:flex-1"><span className="truncate text-slate-300">{attachment.name}</span><button type="button" onClick={() => setAttachment(null)} className="shrink-0 text-rose-300">{isArabic ? "إزالة" : "Remove"}</button></div> : null}
          <button type="button" data-testid="primary-voice-action" title={voiceUnavailable ? (isArabic ? "الإدخال الصوتي غير مدعوم" : "Voice input is not supported") : undefined} aria-label={primaryActionLabel} disabled={isGenerating || isVoiceProcessing || (voiceUnavailable && !hasTextToProcess)} onClick={handlePrimaryAction} className="min-h-11 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-950/30 disabled:cursor-wait disabled:opacity-60">
            {primaryActionLabel}
          </button>
          <button type="button" onClick={newRequest} className="min-h-11 rounded-lg px-1 py-2 text-xs font-semibold text-slate-300 underline-offset-4 hover:underline">{isArabic ? "طلب جديد" : "New Request"}</button>
        </div>

        {/* Text Area */}
        <div data-testid="commercial-composer-input" className="relative min-w-0">
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
            className="block w-full min-w-0 rounded-xl border border-white/10 bg-slate-950 p-3 text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none text-sm"
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



        {workingDraft && resultStale && workingDraft.activeQuestion && <ActiveFieldQuestion draft={workingDraft} isArabic={isArabic} disabled={isGenerating} onAnswer={(answer) => void advanceConversation(answer.value, "CHIP", undefined, answer)} />}
        {workingDraft && !resultStale && (
          <div className="min-w-0 space-y-2 break-words rounded-xl border border-sky-400/20 bg-slate-950/80 p-3" data-testid="commercial-conversation">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-sky-300">{displayLabel(workingDraft.operation, isArabic ? "ar" : "en")}</p><p className="mt-1 text-xs text-slate-400">{isArabic ? "مسودة محادثة واحدة محفوظة — لن يتم إنشاء أي مستند تلقائياً." : "One saved conversational draft — no document will be created automatically."}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${workingDraft.status === "READY_FOR_REVIEW" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{workingDraft.status === "READY_FOR_REVIEW" ? displayLabel("READY_FOR_REVIEW", isArabic ? "ar" : "en") : (isArabic ? "يحتاج معلومات" : "Needs information")}</span></div>
            <p className="text-sm text-slate-200">{isArabic ? "فهمت أنك تريد" : "I understood"}: {displayLabel(workingDraft.operation, isArabic ? "ar" : "en")}{workingDraft.fields.lines.length ? ` — ${(workingDraft.canonicalProposal?.lines ?? workingDraft.fields.lines).map((line) => `${line.quantity ?? ""} ${commercialLineName(line, isArabic)}`.trim()).join(" + ")}` : ""}{workingDraft.fields.customerMention ? ` — ${workingDraft.fields.customerMention}` : ""}.</p>
            {workingDraft.canonicalProposal?.smartSystem && <p className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-2 text-xs text-violet-200">{isArabic ? workingDraft.canonicalProposal.smartSystem.systemNameAr : workingDraft.canonicalProposal.smartSystem.systemNameEn} · {displayLabel(workingDraft.canonicalProposal.smartSystem.status, isArabic ? "ar" : "en")} · {isArabic ? "تم إنشاء بنود مبدئية، وبعض البنود تحتاج مراجعة." : "Preliminary lines are ready; some need review."}</p>}
            {workingDraft.activeQuestion ? <ActiveFieldQuestion draft={workingDraft} isArabic={isArabic} disabled={isGenerating} onAnswer={(answer) => void advanceConversation(answer.value, "CHIP", undefined, answer)} /> : workingDraft.missingRequired.length > 0 && <div className="rounded-xl border-2 border-rose-400/50 bg-rose-500/10 p-3"><p className="text-sm font-bold text-rose-200">{isArabic ? "مطلوب للإكمال:" : "REQUIRED TO COMPLETE:"}</p><div className="mt-2 flex flex-wrap gap-2">{workingDraft.missingRequired.map((field) => <button type="button" key={`${field.key}-${field.sourceField ?? ""}`} className="rounded-lg border border-rose-300/40 px-3 py-2 text-sm font-semibold text-white" onClick={() => { setAnswerTarget(fieldTarget(field)); document.getElementById("sales-prompt-input")?.focus(); }}>{isArabic ? field.labelAr : field.labelEn}</button>)}</div></div>}
            {workingDraft.canonicalProposal?.estimateNotice && <EstimateNotice isArabic={isArabic} />}
            {workingDraft.canonicalProposal && <EngineeringQuantityDetails lines={engineeringReviewLines(workingDraft.canonicalProposal)} isArabic={isArabic} rules={workingDraft.canonicalProposal.smartSystem?.engineeringRules} />}
            <div className="flex flex-wrap gap-2">{workingDraft.customerResolution?.candidates.map((candidate) => <button type="button" key={candidate.id} disabled={isGenerating} onClick={() => advanceConversation(`${isArabic ? "العميل" : "Customer"} ${candidate.name}`, "CHIP", { ...workingDraft.selection, customer: { id: candidate.id, name: candidate.name } })} className="rounded-xl border border-sky-400/30 px-3 py-2 text-sm text-sky-200">{candidate.name}</button>)}</div>
            {workingDraft.canonicalProposal?.lines.filter((line) => line.resolutionStatus === "AMBIGUOUS").map((line) => <CommercialCatalogChoices key={line.componentKey ?? line.itemName} line={line} isArabic={isArabic} disabled={isGenerating} onSelect={(candidate) => void advanceConversation(candidate.name, "CHIP", { ...workingDraft.selection, catalog: { ...workingDraft.selection?.catalog, [line.componentKey ?? line.itemName]: candidate } })} />)}
            {workingDraft.canonicalProposal && <details className="text-xs text-slate-300"><summary>{isArabic ? "البنود ومصادر الأسعار — مراجعة مطلوبة" : "Lines and price sources — review required"}</summary>{workingDraft.canonicalProposal.lines.map((line, index) => <p key={index} className="mt-2">{commercialLineName(line, isArabic)} · {line.quantity ?? "?"} · {line.unitPrice ?? (isArabic ? "السعر يحتاج مراجعة" : "Price needs review")} {workingDraft.canonicalProposal?.proposal.currencyCode} · {line.priceSource === "AI_ESTIMATED" ? (isArabic ? "تقدير ذكاء اصطناعي غير مؤكد" : "Unverified AI estimate") : line.catalogItemId ? (isArabic ? "من الكتالوج" : "Catalog matched") : (isArabic ? "بند مخصص يحتاج مراجعة" : "Custom line — review required")}</p>)}</details>}
            {!workingDraft.activeQuestion && workingDraft.clarification && workingDraft.customerResolution?.status !== "AMBIGUOUS" && <p className="text-sm text-white">{isArabic ? workingDraft.clarification.ar : workingDraft.clarification.en}</p>}
            {workingDraft.customerResolution?.status !== "AMBIGUOUS" && <div className="flex flex-wrap gap-2">{workingDraft.clarification?.suggestions.map((chip, index) => <button key={index} type="button" disabled={isGenerating} onClick={() => advanceConversation(isArabic ? chip.ar : chip.en, "CHIP")} className="rounded-xl border border-sky-400/30 px-3 py-2 text-xs">{isArabic ? chip.ar : chip.en}</button>)}</div>}
            {workingDraft.proposedCustomerName && <p data-testid="proposed-customer-note" className="rounded-lg border border-sky-400/20 bg-sky-400/5 p-2 text-xs text-sky-200">{isArabic ? "العميل غير مسجل حاليًا وسيستمر في المسودة كما هو." : "Customer is not registered yet and will be carried into the draft as entered."}</p>}
            {workingDraft.recommended.length > 0 && <p className="text-xs text-slate-500">{isArabic ? "اختياري/موصى به: " : "Optional/recommended: "}{workingDraft.recommended.map((field) => isArabic ? field.labelAr : field.labelEn).join(isArabic ? "، " : ", ")}</p>}
            {workingDraft.status === "READY_FOR_REVIEW" && <button type="button" onClick={() => void openForHumanReview()} disabled={isGenerating} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950">{isArabic ? "فتح للمراجعة البشرية" : "Open for human review"}</button>}
          </div>
        )}

        {recorded.isSupported && (recorded.state === "RECORDING" || recorded.state === "TRANSCRIBING") && <div className="flex h-10 items-center justify-center gap-1 rounded-xl bg-sky-500/5" aria-label={isArabic ? "موجة التسجيل الصوتي" : "Audio recording waveform"}>{recorded.waveform.map((level, index) => <span key={index} className="w-1 rounded-full bg-sky-400 transition-[height] duration-100" style={{ height: `${Math.max(5, level * 34)}px` }} />)}</div>}

        {/* Accessible Voice Status Live Region */}
        {getVoiceStatusMessage() && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl p-2 text-xs flex flex-wrap items-center gap-2 ${
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
              {displayLabel((recorded.isSupported ? recorded.state : voice.state) === "READY" ? "TRANSCRIPT_READY" : recorded.isSupported ? recorded.state : voice.state, isArabic ? "ar" : "en")}
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
              onClick={() => { setPrompt(isArabic ? sample.textAr : sample.textEn); replySourceRef.current = "TEXT"; if (workingDraft) setResultStale(true); }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sky-300 hover:bg-white/10 transition"
            >
              {isArabic ? sample.labelAr : sample.labelEn}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error === "reattach" ? (isArabic ? "أعد إرفاق ملف الرسم لفتحه للمراجعة." : "Reattach the drawing file to open it for review.") : error === "review" ? (isArabic ? "تعذر فتح نموذج المراجعة. حاول مرة أخرى." : "Unable to open the review form. Please try again.") : (isArabic ? "تعذر فهم الطلب. حاول مرة أخرى؛ النص محفوظ ويمكنك تعديله." : "Unable to understand the request. Please try again; your text is preserved and editable.")}
          </div>
        )}


      </div>

    </div>
  );
}
