"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { useRecordedVoiceInput, useVoiceInput, type AudioTranscriber, type IRawAudioRecorder, type IVoiceRecognizer } from "@/src/infrastructure/voice/browser";
import { buildSystemConfigurationGraph, constrainDocumentDraftReadiness, type ConversationMessageSource, type ConversationRuntimeState } from "@/src/application/conversation-runtime";
import { ActivityIndicator, AssistantContextCues, ChatHeader, Composer, MessageList, NewRequestCTA, SolutionWorkspace, type ActivityStage } from "@/components/sales-assistant";

const RUNTIME_STORAGE_KEY = "voka_conversation_runtime_state_v1";
const SAMPLES = [
  { labelAr: "نظام مصعد سيارات", labelEn: "Vehicle elevator", textAr: "عايز أعمل عرض سعر لمصعد سيارات", textEn: "I need a quotation for a vehicle elevator" },
  { labelAr: "نظام كاميرات", labelEn: "CCTV system", textAr: "محتاج نظام كاميرات مراقبة لمبنى إداري", textEn: "I need a CCTV system for an office building" },
];
function isResearchRequest(value: string) { return /(?:search|research|ابحث|دور\s+(?:على|في)|راجع\s+(?:المصادر|النت)|على\s+النت)/i.test(value); }
function isRuntimeState(value: unknown): value is ConversationRuntimeState { const state = value as Partial<ConversationRuntimeState> | null; return Boolean(state && state.version === 1 && typeof state.runtimeId === "string" && Array.isArray(state.messages) && state.confirmedFacts && Array.isArray(state.candidateFacts) && Array.isArray(state.toolResults) && Array.isArray(state.suggestedReplies)); }

export default function SalesAssistantPage(props: any) {
  const customRecognizer: IVoiceRecognizer | undefined = props?.customRecognizer;
  const customAudioRecorder: IRawAudioRecorder | undefined = props?.customAudioRecorder;
  const customTranscribe: AudioTranscriber | undefined = props?.customTranscribe;
  const { isArabic } = useLanguage();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [runtimeState, setRuntimeState] = useState<ConversationRuntimeState | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentStatus, setAttachmentStatus] = useState<"READY" | "UPLOADING" | "INSPECTING">("READY");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [isCreatingQuotation, setIsCreatingQuotation] = useState(false);
  const [quotationNavigationStarted, setQuotationNavigationStarted] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [pendingResearch, setPendingResearch] = useState(false);
  const [activityStage, setActivityStage] = useState<ActivityStage>("UNDERSTANDING");
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  const sourceRef = useRef<ConversationMessageSource>("TEXT");
  const generationRef = useRef(0);
  const turnInFlightRef = useRef(false);
  const quotationInFlightRef = useRef(false);
  const handoffPreparationRef = useRef(false);
  const quotationRequestRef = useRef(0);
  const quotationNavigationStartedRef = useRef(false);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const timelineRef = useRef<HTMLElement>(null);
  const nearBottomRef = useRef(true);
  const recordedTranscriptHandlerRef = useRef<(text: string) => void>(() => undefined);
  const previousRecordingTranscriptRef = useRef("");
  const prevFinalRef = useRef("");
  const voice = useVoiceInput({ locale: isArabic ? "ar" : "en", recognizer: customRecognizer });
  const recorded = useRecordedVoiceInput({ recorder: customAudioRecorder, transcribe: customTranscribe, contextHints: [runtimeState?.compactMemory ?? "", "IP NVR DVR PoE RJ45 CAT6 FM-200 SUV"], onTranscript: (text) => recordedTranscriptHandlerRef.current(text) });

  useEffect(() => () => { generationRef.current++; }, []);
  useEffect(() => { try { const raw = sessionStorage.getItem(RUNTIME_STORAGE_KEY); if (raw) { const state: unknown = JSON.parse(raw); if (isRuntimeState(state)) setRuntimeState(state); else sessionStorage.removeItem(RUNTIME_STORAGE_KEY); } } catch { sessionStorage.removeItem(RUNTIME_STORAGE_KEY); } }, []);
  useEffect(() => { if (runtimeState) sessionStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtimeState)); }, [runtimeState]);
  useEffect(() => { const input = promptInputRef.current; if (input) { input.style.height = "auto"; input.style.height = `${Math.max(48, Math.min(input.scrollHeight, 168))}px`; } }, [prompt]);
  useEffect(() => {
    if (recorded.isSupported || !voice.transcript.final || voice.transcript.final === prevFinalRef.current) return;
    const previous = prevFinalRef.current;
    const addition = voice.transcript.final.startsWith(previous) ? voice.transcript.final.slice(previous.length).trim() : voice.transcript.final.trim();
    if (addition) setPrompt((value) => value.trim() ? `${value.trim()} ${addition}` : addition);
    sourceRef.current = "VOICE"; prevFinalRef.current = voice.transcript.final;
  }, [recorded.isSupported, voice.transcript.final]);
  useEffect(() => { if (!isGenerating) return; const progress = window.setTimeout(() => setActivityStage(pendingResearch ? "RESEARCHING" : "VERIFYING"), 650); const preparing = window.setTimeout(() => setActivityStage("PREPARING"), pendingResearch ? 7_500 : 2_500); return () => { window.clearTimeout(progress); window.clearTimeout(preparing); }; }, [isGenerating, pendingResearch]);
  useEffect(() => { const timeline = timelineRef.current; if (!timeline || !nearBottomRef.current) return; const frame = window.requestAnimationFrame(() => typeof timeline.scrollTo === "function" ? timeline.scrollTo({ top: timeline.scrollHeight, behavior: "smooth" }) : (timeline.scrollTop = timeline.scrollHeight)); return () => window.cancelAnimationFrame(frame); }, [runtimeState?.messages.length, pendingUserMessage, activityStage]);

  const createQuotation = async (handoffToken: string) => {
    if (!handoffToken || quotationInFlightRef.current || quotationNavigationStartedRef.current) return;
    const requestId = ++quotationRequestRef.current;
    quotationInFlightRef.current = true;
    setIsCreatingQuotation(true); setHandoffError(null);
    try {
      const response = await fetch("/api/ai/conversation-runtime/quotation-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoffToken, locale: isArabic ? "ar" : "en" }) });
      const json = await response.json();
      if (requestId !== quotationRequestRef.current) return;
      if (!response.ok) { setHandoffError(isArabic ? "تعذر إنشاء مسودة العرض. يمكنك المحاولة مرة أخرى." : "The quotation draft could not be created. You can try again."); return; }
      const result = json.data as { status: string; navigationTarget?: string; blockingFields?: Array<{ key: string; candidates?: Array<{ name: string }> }>; message?: string };
      if ((result.status === "CREATED" || result.status === "EXISTING") && result.navigationTarget) {
        quotationNavigationStartedRef.current = true;
        setQuotationNavigationStarted(true);
        router.push(result.navigationTarget);
      } else if (result.status === "NEEDS_COMMERCIAL_INFO") {
        const fields = result.blockingFields ?? [];
        const customerCandidates = fields.flatMap((field) => field.candidates ?? []).map((candidate) => candidate.name);
        setHandoffError(customerCandidates.length ? (isArabic ? `حدد العميل المقصود: ${customerCandidates.join("، ")}` : `Please identify the intended customer: ${customerCandidates.join(", ")}`) : (isArabic ? "توجد معلومة تجارية تحتاج مراجعة قبل متابعة المسودة." : "A commercial detail needs review before continuing the Draft."));
      } else {
        setHandoffError(isArabic ? "تعذر إنشاء مسودة العرض. يمكنك المحاولة مرة أخرى." : "The quotation draft could not be created. You can try again.");
      }
    } catch {
      if (requestId === quotationRequestRef.current) setHandoffError(isArabic ? "تعذر إنشاء مسودة العرض. يمكنك المحاولة مرة أخرى." : "The quotation draft could not be created. You can try again.");
    } finally {
      if (requestId === quotationRequestRef.current) {
        quotationInFlightRef.current = false;
        setIsCreatingQuotation(false);
      }
    }
  };

  const advanceConversation = async (explicitMessage?: string, explicitSource = sourceRef.current) => {
    const message = (explicitMessage ?? prompt).trim(); if (!message || turnInFlightRef.current) return;
    const generation = ++generationRef.current;
    turnInFlightRef.current = true;
    setIsGenerating(true); setError(false); setHandoffError(null); setPendingUserMessage(message); setPendingResearch(isResearchRequest(message)); setActivityStage("UNDERSTANDING");
    try {
      let attachmentPayload: { id: string; name: string; type: string; size: number } | null = null;
      if (attachment) {
        setAttachmentStatus("UPLOADING");
        const form = new FormData();
        form.set("file", attachment);
        form.set("context", "SALES_ASSISTANT");
        if (runtimeState?.runtimeId) form.set("conversationRuntimeId", runtimeState.runtimeId);
        const uploadResponse = await fetch("/api/source-artifacts", { method: "POST", body: form });
        const uploadJson = await uploadResponse.json();
        if (!uploadResponse.ok || typeof uploadJson.data?.artifact?.id !== "string") throw new Error(uploadJson.error?.message ?? "Attachment upload failed");
        const artifact = uploadJson.data.artifact as { id: string; originalFilename: string; mimeType: string; sizeBytes: number };
        attachmentPayload = { id: artifact.id, name: artifact.originalFilename, type: artifact.mimeType, size: artifact.sizeBytes };
        setAttachmentStatus("INSPECTING");
      }
      const response = await fetch("/api/ai/conversation-runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: runtimeState, message, source: explicitSource, reply: message, replySource: explicitSource, locale: isArabic ? "ar" : "en", attachment: attachmentPayload }) });
      const json = await response.json(); if (generation !== generationRef.current) return; if (!response.ok) throw new Error(json.error?.message ?? "Conversation failed");
      if (!isRuntimeState(json.data)) throw new Error("Invalid conversation runtime response");
      setRuntimeState(json.data); setPrompt(""); setAttachment(null); setAttachmentStatus("READY"); sourceRef.current = "TEXT";
    } catch { if (generation === generationRef.current) { setAttachmentStatus("READY"); setError(true); } }
    finally { if (generation === generationRef.current) { turnInFlightRef.current = false; setIsGenerating(false); setPendingUserMessage(null); setPendingResearch(false); } }
  };
  recordedTranscriptHandlerRef.current = (text) => { if (!text || text === previousRecordingTranscriptRef.current) return; previousRecordingTranscriptRef.current = text; sourceRef.current = "VOICE"; setPrompt(text); void advanceConversation(text, "VOICE"); };

  const voiceCapabilityKnown = Boolean(recorded.capabilityKnown && voice.capabilityKnown);
  const isListening = voiceCapabilityKnown && (recorded.isSupported ? recorded.state === "RECORDING" : voice.state === "LISTENING");
  const isVoiceProcessing = voiceCapabilityKnown && (recorded.isSupported ? recorded.state === "TRANSCRIBING" : voice.state === "PROCESSING");
  const voiceUnavailable = voiceCapabilityKnown && !recorded.isSupported && !voice.isSupported;
  const hasText = Boolean(prompt.trim());
  const handleVoiceToggle = () => { if (recorded.isSupported) { if (recorded.state === "RECORDING") recorded.stopRecording(); else if (recorded.state !== "TRANSCRIBING") { previousRecordingTranscriptRef.current = ""; void recorded.startRecording(); } } else if (voice.state === "LISTENING" || voice.state === "PROCESSING") voice.stopListening(); else { prevFinalRef.current = ""; voice.startListening(isArabic ? "ar-KW" : "en-US"); } };
  const handlePrimaryAction = () => { if (isGenerating || isVoiceProcessing) return; if (isListening || (!hasText && !attachment)) handleVoiceToggle(); else void advanceConversation(); };
  const newRequest = () => { generationRef.current++; quotationRequestRef.current++; turnInFlightRef.current = false; handoffPreparationRef.current = false; quotationInFlightRef.current = false; quotationNavigationStartedRef.current = false; recorded.resetRecording(); voice.resetVoiceInput(); setPrompt(""); setRuntimeState(null); setAttachment(null); setAttachmentStatus("READY"); setError(false); setHandoffError(null); setIsGenerating(false); setIsCreatingQuotation(false); setQuotationNavigationStarted(false); setPendingUserMessage(null); setPendingResearch(false); setShowLatest(false); sourceRef.current = "TEXT"; sessionStorage.removeItem(RUNTIME_STORAGE_KEY); };
  const copyMessage = async (text: string, index: number) => { try { await navigator.clipboard.writeText(text); setCopiedMessage(index); window.setTimeout(() => setCopiedMessage((value) => value === index ? null : value), 1_500); } catch { /* optional */ } };
  const handleTimelineScroll = () => { const timeline = timelineRef.current; if (!timeline) return; const near = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 96; nearBottomRef.current = near; setShowLatest(!near); };
  const scrollToLatest = () => { const timeline = timelineRef.current; if (!timeline) return; nearBottomRef.current = true; setShowLatest(false); typeof timeline.scrollTo === "function" ? timeline.scrollTo({ top: timeline.scrollHeight, behavior: "smooth" }) : (timeline.scrollTop = timeline.scrollHeight); };
  const messages = runtimeState?.messages ?? [];
  const hasConversation = Boolean(messages.length || pendingUserMessage);
  const solutionGraph = runtimeState ? constrainDocumentDraftReadiness(runtimeState.solutionGraph ?? buildSystemConfigurationGraph(runtimeState.confirmedFacts), runtimeState.confirmedFacts) : null;
  const hasSolutionWorkspace = Boolean(solutionGraph?.system);
  const prepareQuotation = async () => {
    if (!runtimeState || !solutionGraph?.readiness.draftReady || handoffPreparationRef.current || quotationInFlightRef.current || quotationNavigationStartedRef.current) return;
    if (typeof runtimeState.handoffToken === "string" && runtimeState.handoffToken) { await createQuotation(runtimeState.handoffToken); return; }
    handoffPreparationRef.current = true;
    setIsCreatingQuotation(true); setHandoffError(null);
    try {
      const response = await fetch("/api/ai/conversation-runtime/prepare-handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: runtimeState }) });
      const json = await response.json();
      if (!response.ok || typeof json.data?.handoffToken !== "string") {
        setHandoffError(json.error?.code === "DOCUMENT_TARGET_UNAVAILABLE"
          ? isArabic ? "نوع المستند المطلوب غير متاح هنا. اطلب تجهيز عرض سعر للمتابعة." : "That document type is not available here. Ask to prepare a quotation to continue."
          : json.error?.code === "CUSTOMER_NAME_REQUIRED"
            ? isArabic ? "اذكر اسم العميل في المحادثة، ثم افتح المسودة." : "Tell me the customer name in chat, then open the draft."
            : isArabic ? "تعذر تجهيز الانتقال للمسودة. يمكنك المحاولة مرة أخرى." : "The draft handoff could not be prepared. You can try again.");
        return;
      }
      handoffPreparationRef.current = false; setIsCreatingQuotation(false);
      await createQuotation(json.data.handoffToken);
    } catch { setHandoffError(isArabic ? "تعذر تجهيز المسودة. حاول مرة أخرى." : "The draft could not be prepared. Try again."); }
    finally { handoffPreparationRef.current = false; if (!quotationInFlightRef.current) setIsCreatingQuotation(false); }
  };
  const reconcileWorkspace = async () => {
    if (!runtimeState || turnInFlightRef.current) return;
    const generation = ++generationRef.current;
    turnInFlightRef.current = true; setIsGenerating(true); setError(false); setActivityStage("UNDERSTANDING");
    try {
      const response = await fetch("/api/ai/conversation-runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: runtimeState, action: "RECONCILE", source: "CHIP", locale: isArabic ? "ar" : "en" }) });
      const json = await response.json();
      if (generation !== generationRef.current) return;
      if (!response.ok || !isRuntimeState(json.data)) throw new Error("Workspace reconciliation failed");
      setRuntimeState(json.data);
    } catch { if (generation === generationRef.current) setError(true); }
    finally { if (generation === generationRef.current) { turnInFlightRef.current = false; setIsGenerating(false); } }
  };
  const primaryActionLabel = isGenerating || isVoiceProcessing ? (isArabic ? "جارٍ الفهم..." : "Understanding...") : isListening ? (isArabic ? "إيقاف وإرسال" : "Stop & Send") : (hasText || attachment) ? (isArabic ? "ابدأ الطلب" : "Start Request") : (isArabic ? "ابدأ الطلب صوتيًا" : "Start by Voice");
  const controls = <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 px-2">{!hasConversation ? <NewRequestCTA isArabic={isArabic} onClick={newRequest} /> : null}</div>;
  const voiceStatus = recorded.isSupported
    ? recorded.state === "RECORDING" ? (isArabic ? "جاري تسجيل الصوت... اضغط الميكروفون للإيقاف." : "Recording audio… Press the microphone to stop.")
      : recorded.state === "TRANSCRIBING" ? (isArabic ? "جاري تفريغ التسجيل كاملاً..." : "Transcribing the complete recording…")
        : recorded.state === "READY" ? (isArabic ? "اكتمل التفريغ والفهم. يمكنك مراجعة النص وتعديله." : "Transcription and understanding complete. You can review and edit the text.")
          : recorded.state === "PERMISSION_DENIED" ? (isArabic ? "يرجى السماح بالوصول إلى الميكروفون في إعدادات المتصفح." : "Please allow microphone access in browser settings.")
            : recorded.state === "ERROR" ? (isArabic ? "تعذر تسجيل الصوت أو تفريغه. حاول مرة أخرى أو اكتب طلبك." : "Audio recording or transcription failed. Try again or type your request.") : null
    : voice.state === "PERMISSION_DENIED" ? (isArabic ? "تم رفض الإذن لاستخدام الميكروفون. يرجى السماح للوصول للميكروفون في المتصفح." : "Microphone permission denied. Please allow microphone access in browser settings.")
      : voice.state === "ERROR" ? (isArabic ? "حدث خطأ أثناء التعرف على الصوت." : "An error occurred during voice recognition.")
        : voice.state === "UNAVAILABLE" ? (isArabic ? "إدخال الصوت غير مدعوم في هذا المتصفح. يمكنك إدخال النص يدوياً." : "Voice input is not supported in this browser. You can type manually.") : null;
  const voiceStatusLabel = !recorded.isSupported && voice.state === "UNAVAILABLE" ? (isArabic ? "غير متاح" : "Unavailable") : !recorded.isSupported && voice.state === "PERMISSION_DENIED" ? (isArabic ? "تم رفض إذن الميكروفون" : "Microphone permission denied") : !recorded.isSupported && voice.state === "ERROR" ? (isArabic ? "خطأ" : "Error") : null;
  const status = <>{recorded.isSupported && (recorded.state === "RECORDING" || recorded.state === "TRANSCRIBING") ? <div className="flex h-10 items-center justify-center gap-1 rounded-xl bg-sky-500/5" aria-label={isArabic ? "موجة التسجيل الصوتي" : "Audio recording waveform"}>{recorded.waveform.map((level, index) => <span key={index} className="w-1 rounded-full bg-sky-400" style={{ height: `${Math.max(5, level * 34)}px` }} />)}</div> : null}{voiceStatus ? <div role="status" className="flex flex-wrap gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.07] p-2.5 text-xs text-sky-300">{voiceStatusLabel ? <span className="font-semibold">{voiceStatusLabel}</span> : null}<span>{voiceStatus}</span></div> : null}{error ? <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{isArabic ? "تعذر الوصول إلى مساعد المحادثة. النص محفوظ ويمكنك المحاولة مرة أخرى." : "The conversation assistant could not be reached. Your text is preserved; please try again."}</div> : null}</>;

  return <div className={`mx-auto min-w-0 max-w-[90rem] space-y-4 overflow-x-clip pb-8 ${isArabic ? "font-[var(--font-cairo)]" : ""}`} dir={isArabic ? "rtl" : "ltr"}>
    <ChatHeader isArabic={isArabic} hasConversation={hasConversation} onNewRequest={newRequest} />
    <div data-testid="commercial-composer" data-commercial-state={isGenerating ? "UNDERSTANDING" : runtimeState?.transitionState ?? "EMPTY"} className={`relative grid min-h-[68vh] min-w-0 gap-5 ${hasSolutionWorkspace ? "xl:grid-cols-[22rem_minmax(0,1fr)]" : ""}`} dir="ltr">
      {solutionGraph?.system ? <div dir={isArabic ? "rtl" : "ltr"}><SolutionWorkspace graph={solutionGraph} workspace={runtimeState?.workspace} isArabic={isArabic} onOpenDraft={() => void prepareQuotation()} onSync={() => void reconcileWorkspace()} draftLoading={isCreatingQuotation || quotationNavigationStarted} syncLoading={isGenerating} error={handoffError} /></div> : null}
      <main className="flex min-h-[68vh] min-w-0 flex-col" dir={isArabic ? "rtl" : "ltr"}>
        <label htmlFor="sales-prompt-input" className="sr-only">{isArabic ? "تحدث مع فوكا" : "Talk to VOKA"}</label>
        {hasConversation ? <MessageList ref={timelineRef} messages={messages} pendingUserMessage={pendingUserMessage} isArabic={isArabic} copiedMessage={copiedMessage} onCopy={(text, index) => void copyMessage(text, index)} onScroll={handleTimelineScroll} showLatest={showLatest} onLatest={scrollToLatest} latestAssistantContent={runtimeState ? <AssistantContextCues state={runtimeState} isArabic={isArabic} /> : null} activity={isGenerating ? <ActivityIndicator stage={activityStage} isArabic={isArabic} /> : null} /> : <div className="mt-auto pb-5 pt-10 text-center"><p className="text-sm font-medium text-slate-300">{isArabic ? "ابدأ بفكرة، سؤال، أو مستند" : "Start with an idea, a question, or a document"}</p><p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500">{isArabic ? "تحدث بطبيعتك، وفوكا يحافظ على السياق ويطوّر الحل معك." : "Speak naturally; VOKA keeps context and develops the solution with you."}</p><div className="mt-4 flex flex-wrap justify-center gap-2">{SAMPLES.map((sample) => <button key={sample.labelEn} type="button" onClick={() => setPrompt(isArabic ? sample.textAr : sample.textEn)} className="rounded-2xl border border-white/[0.075] bg-white/[0.03] px-3.5 py-2 text-xs text-sky-200 outline-none transition hover:border-sky-300/20 hover:bg-sky-300/[0.06] focus-visible:ring-2 focus-visible:ring-sky-400">{isArabic ? sample.labelAr : sample.labelEn}</button>)}</div></div>}
        {runtimeState?.suggestedReplies.length ? <div className="mb-3 flex flex-wrap gap-2" data-testid="compact-conversation-actions">{runtimeState.suggestedReplies.map((reply) => <button key={reply} type="button" disabled={isGenerating} onClick={() => void advanceConversation(reply, "CHIP")} className="rounded-xl border border-sky-400/25 bg-sky-300/[0.035] px-3 py-2 text-xs text-sky-100 outline-none hover:bg-sky-300/[0.07] focus-visible:ring-2 focus-visible:ring-sky-400">{reply}</button>)}</div> : null}
        <Composer isArabic={isArabic} value={prompt} inputRef={promptInputRef} attachment={attachment} attachmentStatus={attachmentStatus} primaryActionLabel={primaryActionLabel} hasText={hasText || Boolean(attachment)} isListening={isListening} disabled={isGenerating || isVoiceProcessing || (voiceUnavailable && !hasText && !attachment)} voiceUnavailable={voiceUnavailable} interimTranscript={voice.transcript.interim} onChange={(event) => { generationRef.current++; setIsGenerating(false); setPendingUserMessage(null); setPrompt(event.target.value); sourceRef.current = "TEXT"; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && (hasText || attachment)) { event.preventDefault(); handlePrimaryAction(); } }} onPrimaryAction={handlePrimaryAction} onAttachment={(file) => { setAttachment(file); setAttachmentStatus("READY"); }} onRemoveAttachment={() => { setAttachment(null); setAttachmentStatus("READY"); }} controls={controls} status={status} elevated={hasConversation} />
        {!hasConversation ? <div className="mb-auto h-12" /> : null}
      </main>
    </div>
  </div>;
}
