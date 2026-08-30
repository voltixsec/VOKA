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
import { projectStructuredResult, type ConversationBuildMode, type ConversationDocumentMode, type ConversationReplySource, type WorkingCommercialDraft } from "@/src/application/commercial-conversation";
import type { FieldAnswer } from "@/src/application/commercial-conversation";
import { commercialPhase } from "@/src/application/commercial-conversation/field-completion";

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

type ActivityStage = "UNDERSTANDING" | "RESEARCHING" | "VERIFYING" | "PREPARING";

function isResearchRequest(value: string) {
  return /(?:search|research|ابحث|دور\s+(?:على|في)|راجع\s+(?:المصادر|النت)|على\s+النت)/i.test(value);
}

function Icon({ name, className = "h-5 w-5" }: { name: "attach" | "mic" | "send" | "copy" | "latest"; className?: string }) {
  const paths = {
    attach: <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    copy: <><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
    latest: <><path d="m6 9 6 6 6-6" /><path d="M12 3v12" /></>,
  } as const;
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

function ActivityIndicator({ stage, isArabic }: { stage: ActivityStage; isArabic: boolean }) {
  const copy: Record<ActivityStage, [string, string]> = {
    UNDERSTANDING: ["جاري فهم الطلب…", "Understanding your request…"],
    RESEARCHING: ["أراجع المصادر الفنية…", "Reviewing technical sources…"],
    VERIFYING: ["أتحقق من المعلومات…", "Checking the information…"],
    PREPARING: ["أجهز الرد…", "Preparing the response…"],
  };
  return <div role="status" aria-live="polite" data-testid="assistant-activity" data-activity-stage={stage} className="flex items-center gap-3 py-3 text-sm text-slate-300">
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/10 text-sky-300" aria-hidden="true">
      <span className="h-2 w-2 animate-pulse rounded-full bg-sky-300 motion-reduce:animate-none" />
    </span>
    <span>{isArabic ? copy[stage][0] : copy[stage][1]}</span>
    <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((item) => <span key={item} className="h-1 w-1 animate-bounce rounded-full bg-slate-500 motion-reduce:animate-none" style={{ animationDelay: `${item * 120}ms` }} />)}</span>
  </div>;
}

function SystemUnderstandingPanel({ draft, isArabic }: { draft: WorkingCommercialDraft; isArabic: boolean }) {
  const insight = (draft.structuredResult ?? projectStructuredResult(draft)).systemUnderstanding;
  if (!insight) return null;
  return <div data-testid="system-understanding" className="mt-4 border-s-2 border-sky-400/35 ps-4">
    <p className="flex items-center gap-2 text-sm font-semibold text-sky-100"><span className="text-emerald-300" aria-hidden="true">✓</span>{isArabic ? insight.headingAr : insight.headingEn}</p>
    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">{isArabic ? insight.descriptionAr : insight.descriptionEn}</p>
    {insight.components.length ? <details className="group mt-2 text-sm" data-testid="understood-components">
      <summary className="w-fit cursor-pointer list-none rounded-lg py-1 text-sky-300 outline-none hover:text-sky-200 focus-visible:ring-2 focus-visible:ring-sky-400">{isArabic ? "المكونات التي فهمتها" : "Components I understood"}<span className="ms-1 inline-block transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">⌄</span></summary>
      <ul className="mt-2 grid gap-1.5 text-slate-300 sm:grid-cols-2">{insight.components.map((component) => <li key={component.labelEn} className="flex gap-2"><span className="text-slate-600" aria-hidden="true">—</span><span>{isArabic ? component.labelAr : component.labelEn}</span></li>)}</ul>
    </details> : null}
  </div>;
}

function CommittedFactChips({ draft, isArabic }: { draft: WorkingCommercialDraft; isArabic: boolean }) {
  const result = draft.structuredResult ?? projectStructuredResult(draft);
  const facts = result.summary.filter((fact) => fact.status === "CONFIRMED" || fact.status === "VERIFIED").slice(0, 5);
  if (!facts.length) return null;
  return <div className="mt-3 flex flex-wrap gap-1.5" aria-label={isArabic ? "المعلومات المؤكدة" : "Confirmed facts"}>{facts.map((fact) => <span data-testid="committed-fact-chip" key={fact.key} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.045] px-2.5 py-1 text-xs text-slate-300"><span className="text-emerald-300" aria-hidden="true">✓</span>{isArabic ? fact.valueAr ?? fact.value : fact.valueEn ?? fact.value}</span>)}</div>;
}

function SourcesDisclosure({ draft, isArabic }: { draft: WorkingCommercialDraft; isArabic: boolean }) {
  const evidence = (draft.structuredResult ?? projectStructuredResult(draft)).evidence;
  if (!evidence.length) return null;
  return <details className="mt-3 w-fit text-xs" data-testid="assistant-sources">
    <summary className="cursor-pointer list-none rounded-lg py-1 text-slate-400 outline-none hover:text-sky-200 focus-visible:ring-2 focus-visible:ring-sky-400">{isArabic ? "المصادر" : "Sources"} <span className="text-slate-600">({evidence.length})</span></summary>
    <div className="mt-2 min-w-[16rem] max-w-xl space-y-2 rounded-xl border border-white/[0.07] bg-slate-950/70 p-3">{evidence.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="block rounded-lg p-1 text-slate-300 outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-sky-400"><span className="block font-medium text-sky-200">{item.title}</span><span className="mt-0.5 block text-slate-500">{item.publisher}</span></a>)}</div>
  </details>;
}

function CompactLiveResult({ draft, isArabic, onOpenForReview }: { draft: WorkingCommercialDraft; isArabic: boolean; onOpenForReview: () => void }) {
  const result = draft.structuredResult ?? projectStructuredResult(draft);
  const commercial = result?.commercial ?? { lineCount: draft.canonicalProposal?.lines.length ?? 0, priceRequiredCount: draft.canonicalProposal?.lines.filter((line) => line.unitPrice == null).length ?? 0, draftReady: draft.status === "READY_FOR_REVIEW" };
  const value = (fact: NonNullable<typeof result>["summary"][number]) => isArabic ? (fact.valueAr ?? fact.value) : (fact.valueEn ?? fact.value);
  return (
    <section className="min-w-0 space-y-3 break-words rounded-2xl border border-white/[0.07] bg-white/[0.018] p-3 sm:p-4" data-testid="commercial-conversation" data-live-result="true" aria-label={isArabic ? "ملخص الطلب" : "Request summary"}>
      <div>
        <p className="text-xs font-semibold tracking-wide text-slate-300">{isArabic ? "ملخص الطلب" : "Request summary"}</p>
        <p className="mt-1 text-xs text-slate-600">{isArabic ? "متزامن مع المعلومات المؤكدة في المحادثة" : "Synchronized with committed conversation facts"}</p>
      </div>
      {result?.summary?.length ? <dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2" data-testid="compact-request-summary">{result.summary.map((fact) => <div key={fact.key} className="flex min-w-0 gap-2"><dt className="shrink-0 text-slate-400">{isArabic ? fact.labelAr : fact.labelEn}:</dt><dd className="min-w-0 text-slate-100">{value(fact)}</dd></div>)}</dl> : <p className="text-sm text-slate-400">{isArabic ? "الملخص سيتحدث مع استمرار المحادثة." : "The summary will update as the conversation continues."}</p>}
      {result?.stillNeeded?.length ? <p className="text-xs text-slate-400" data-testid="compact-still-needed"><span className="font-semibold text-slate-300">{isArabic ? "متبقي:" : "Still needed:"}</span> {result.stillNeeded.map((field) => isArabic ? field.labelAr : field.labelEn).join(isArabic ? "، " : ", ")}</p> : null}
      {(commercial.lineCount > 0 || commercial.draftReady) ? <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs text-slate-300" data-testid="compact-commercial-result">
        {commercial.lineCount > 0 ? <p>{isArabic ? `${commercial.lineCount} بند تجاري${commercial.priceRequiredCount ? `، وأسعار ${commercial.priceRequiredCount} بند ما زالت مطلوبة` : "، والأسعار مكتملة"}` : `${commercial.lineCount} commercial line${commercial.lineCount === 1 ? "" : "s"}${commercial.priceRequiredCount ? `; ${commercial.priceRequiredCount} still need pricing` : "; pricing complete"}`}</p> : null}
        {commercial.draftReady ? <><p className="mt-1">{isArabic ? "المسودة جاهزة للمراجعة" : "Draft ready for review"}</p><button type="button" onClick={onOpenForReview} className="mt-2 rounded-xl bg-emerald-400 px-3 py-2 font-semibold text-slate-950">{isArabic ? "فتح للمراجعة البشرية" : "Open for human review"}</button></> : null}
      </div> : null}
      {draft.canonicalProposal ? <details className="text-xs text-slate-300" data-testid="live-result-details"><summary className="w-fit cursor-pointer text-slate-400 hover:text-sky-200">{isArabic ? "عرض التفاصيل" : "View details"}</summary>
        <div className="mt-3 space-y-3">
          {draft.canonicalProposal?.estimateNotice ? <EstimateNotice isArabic={isArabic} /> : null}
          {draft.canonicalProposal ? <EngineeringQuantityDetails lines={engineeringReviewLines(draft.canonicalProposal)} isArabic={isArabic} rules={draft.canonicalProposal.smartSystem?.engineeringRules} /> : null}
          {draft.canonicalProposal?.lines.length ? <div>{draft.canonicalProposal.lines.map((line, index) => <p key={index} className="mt-2">{commercialLineName(line, isArabic)} · {line.quantity ?? "?"} · {line.unitPrice ?? (isArabic ? "السعر مطلوب" : "Price required")} {draft.canonicalProposal?.proposal.currencyCode}</p>)}</div> : null}
        </div>
      </details> : null}
    </section>
  );
}

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
  const [activityStage, setActivityStage] = useState<ActivityStage>("UNDERSTANDING");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [pendingResearch, setPendingResearch] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [showLatest, setShowLatest] = useState(false);

  const replySourceRef = useRef<ConversationReplySource>("TEXT");
  const analysisGeneration = useRef(0);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const timelineRef = useRef<HTMLElement>(null);
  const nearBottomRef = useRef(true);
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
        setWorkingDraft(draft); setPrompt("");
        setDocumentMode(draft.documentMode ?? "AUTO"); setBuildMode(draft.buildMode ?? "AUTO");
      }
    } catch {
      sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (workingDraft) sessionStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(workingDraft));
  }, [workingDraft]);

  useEffect(() => {
    const input = promptInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.max(48, Math.min(input.scrollHeight, 168))}px`;
  }, [prompt]);

  useEffect(() => {
    if (!isGenerating) return;
    const progress = window.setTimeout(() => setActivityStage(pendingResearch ? "RESEARCHING" : "VERIFYING"), pendingResearch ? 550 : 700);
    const preparing = window.setTimeout(() => setActivityStage("PREPARING"), pendingResearch ? 7_500 : 2_400);
    return () => { window.clearTimeout(progress); window.clearTimeout(preparing); };
  }, [isGenerating, pendingResearch]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline || !nearBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (typeof timeline.scrollTo === "function") timeline.scrollTo({ top: timeline.scrollHeight, behavior: "smooth" });
      else timeline.scrollTop = timeline.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workingDraft?.conversationMessages?.length, pendingUserMessage, activityStage]);

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
  const awaitingClarification = workingDraft?.status === "NEEDS_CLARIFICATION";
  const primaryActionLabel = isGenerating || isVoiceProcessing
    ? (isArabic ? "جارٍ الفهم..." : "Understanding...")
    : isListening
      ? (isArabic ? "إيقاف وإرسال" : "Stop & Send")
      : awaitingClarification
        ? hasTextToProcess
          ? (isArabic ? "أكمل الطلب" : "Continue Request")
          : (isArabic ? "أكمل صوتيًا" : "Continue by Voice")
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
    const reply = explicitReply ?? visibleBefore;
    const reanalyze = false;
    // Free text is always a full conversational turn. Only an explicitly chosen
    // summary field or clarification control creates a targeted field answer.
    const target = workingDraft?.activeQuestion?.field;
    if (!reply.trim()) return;

    setIsGenerating(true);
    setError(null);
    setResultStale(true);
    setPendingUserMessage(reply.trim());
    setPendingResearch(isResearchRequest(reply));
    setActivityStage("UNDERSTANDING");

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
      setPrompt("");
      setResultStale(false);
      replySourceRef.current = "TEXT";
    } catch {
      if (generation !== analysisGeneration.current) return;
      setError("analysis");
    } finally {
      if (generation === analysisGeneration.current) {
        setIsGenerating(false);
        setPendingUserMessage(null);
        setPendingResearch(false);
      }
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
    setPendingUserMessage(null); setPendingResearch(false);
    setDocumentMode(nextDocument); setBuildMode(nextBuild); setWorkingDraft(null); setResultStale(false);
    sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
  };

  const newRequest = () => {
    analysisGeneration.current++; setIsGenerating(false); recorded.resetRecording(); voice.resetVoiceInput();
    setPrompt(""); setWorkingDraft(null); setAttachment(null); setError(null); setResultStale(false); setPendingUserMessage(null); setPendingResearch(false); setShowLatest(false);
    setDocumentMode("AUTO"); setBuildMode("AUTO"); replySourceRef.current = "TEXT";
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

  const handleTimelineScroll = () => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const nearBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 96;
    nearBottomRef.current = nearBottom;
    setShowLatest(!nearBottom);
  };

  const scrollToLatest = () => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    nearBottomRef.current = true;
    setShowLatest(false);
    if (typeof timeline.scrollTo === "function") timeline.scrollTo({ top: timeline.scrollHeight, behavior: "smooth" });
    else timeline.scrollTop = timeline.scrollHeight;
  };

  const copyMessage = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(index);
      window.setTimeout(() => setCopiedMessage((current) => current === index ? null : current), 1_500);
    } catch { /* Clipboard access is optional. */ }
  };

  return (
    <div className={`mx-auto min-w-0 max-w-6xl space-y-4 pb-8 ${isArabic ? "font-[var(--font-cairo)]" : ""}`} dir={isArabic ? "rtl" : "ltr"}>
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
          {isArabic ? "مساعد فوكا التجاري" : "VOKA Sales Assistant"}
        </p>

        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
          {isArabic ? "ما الذي تريد إنجازه؟" : "What would you like to accomplish?"}
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          {isArabic
            ? "تحدث بشكل طبيعي. سأفهم النظام وأرتب التفاصيل، وتبقى أنت صاحب قرار الاعتماد."
            : "Speak naturally. I’ll understand the system and organize the details; you remain in control of approval."}
        </p>
        </div>
      </div>

      {/* Unified Attach + Text + Voice input */}
      <div data-testid="commercial-composer" data-commercial-state={commercialPhase(workingDraft, isGenerating, resultStale)} className="relative flex min-h-[68vh] min-w-0 flex-col gap-2">
        <div className="sr-only">
          <label htmlFor="sales-prompt-input" className="sr-only">
            {isArabic ? "طلب المبيعات (اللغة الطبيعية)" : "Sales Request Prompt (Natural Language)"}
          </label>

        </div>

        {(workingDraft?.conversationMessages?.length || workingDraft?.turns.length || pendingUserMessage) ? (
          <section ref={timelineRef} onScroll={handleTimelineScroll} data-testid="conversation-timeline" aria-label={isArabic ? "المحادثة" : "Conversation"} className="order-1 max-h-[37rem] min-h-0 space-y-7 overflow-y-auto scroll-smooth px-1 py-4 [scrollbar-gutter:stable] sm:px-3">
            {(() => {
              const messages = workingDraft?.conversationMessages ?? workingDraft?.turns ?? [];
              const latestAssistant = messages.map((turn) => turn.role ?? "USER").lastIndexOf("ASSISTANT");
              return <>
                {messages.map((turn, index) => {
                  const user = (turn.role ?? "USER") === "USER";
                  const latest = !user && index === latestAssistant;
                  return <article key={`${index}-${turn.text.slice(0, 20)}`} className={`group flex ${user ? "justify-end" : "justify-start"}`}>
                    {user ? <div className="max-w-[86%] rounded-[1.35rem] rounded-ee-md bg-sky-300 px-4 py-2.5 text-sm leading-6 text-slate-950 shadow-[0_12px_36px_-20px_rgba(56,189,248,.8)] sm:max-w-[72%]">
                      <p className="whitespace-pre-wrap">{turn.text}</p>
                    </div> : <div className="w-full max-w-3xl min-w-0 text-slate-100">
                      <div className="mb-2 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-400/10 text-[10px] font-bold tracking-wide text-sky-300">V</span><span className="text-xs font-semibold tracking-wide text-slate-400">VOKA</span></div>
                      <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-100 sm:text-base sm:leading-8">{turn.text}</p>
                      {latest && workingDraft ? <><SystemUnderstandingPanel draft={workingDraft} isArabic={isArabic} /><CommittedFactChips draft={workingDraft} isArabic={isArabic} /><SourcesDisclosure draft={workingDraft} isArabic={isArabic} /></> : null}
                      <div className="mt-2 flex min-h-7 items-center gap-1 opacity-100 transition motion-reduce:transition-none sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button type="button" onClick={() => void copyMessage(turn.text, index)} aria-label={isArabic ? "نسخ الرد" : "Copy response"} className="rounded-lg p-1.5 text-slate-500 outline-none hover:bg-white/[0.05] hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-sky-400"><Icon name="copy" className="h-3.5 w-3.5" /></button>
                        {copiedMessage === index ? <span role="status" className="text-[11px] text-emerald-300">{isArabic ? "تم النسخ" : "Copied"}</span> : null}
                      </div>
                    </div>}
                  </article>;
                })}
                {pendingUserMessage ? <article className="flex justify-end" data-testid="pending-user-message"><div className="max-w-[86%] rounded-[1.35rem] rounded-ee-md bg-sky-300/90 px-4 py-2.5 text-sm leading-6 text-slate-950 sm:max-w-[72%]">{pendingUserMessage}</div></article> : null}
                {isGenerating ? <ActivityIndicator stage={activityStage} isArabic={isArabic} /> : null}
              </>;
            })()}
            {showLatest ? <button type="button" onClick={scrollToLatest} className="sticky bottom-2 mx-auto flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/95 px-3 py-2 text-xs text-slate-300 shadow-xl backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-sky-400"><Icon name="latest" className="h-4 w-4" />{isArabic ? "أحدث رسالة" : "Latest message"}</button> : null}
          </section>
        ) : null}

        <div data-testid="commercial-composer-controls" className="order-4 flex min-w-0 flex-wrap items-center justify-between gap-2 px-2 pt-1">
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer rounded-lg py-2 outline-none hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-sky-400">{isArabic ? "خيارات الطلب" : "Request options"}</summary>
            <div className="mt-2 flex flex-wrap gap-3 rounded-xl border border-white/[0.06] bg-slate-950/70 p-3">
              <label className="flex min-w-[9rem] flex-1 flex-col gap-1.5 text-xs text-slate-400">{isArabic ? "المستند" : "Document"}<select aria-label={isArabic ? "نوع المستند" : "Document type"} value={documentMode} onChange={(event) => invalidateSelection(event.target.value as ConversationDocumentMode, buildMode)} className="min-h-10 rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-slate-100 outline-none focus:border-sky-400"><option value="AUTO">{displayLabel("AUTO", isArabic ? "ar" : "en")}</option><option value="QUOTATION">{displayLabel("QUOTATION", isArabic ? "ar" : "en")}</option><option value="INVOICE">{displayLabel("INVOICE", isArabic ? "ar" : "en")}</option><option value="CONTRACT">{displayLabel("CONTRACT", isArabic ? "ar" : "en")}</option><option value="SALES_ORDER">{displayLabel("SALES_ORDER", isArabic ? "ar" : "en")}</option></select></label>
              <label className="flex min-w-[9rem] flex-1 flex-col gap-1.5 text-xs text-slate-400">{isArabic ? "أسلوب البناء" : "Build mode"}<select aria-label={isArabic ? "نمط البناء" : "Build mode"} value={buildMode} onChange={(event) => invalidateSelection(documentMode, event.target.value as ConversationBuildMode)} className="min-h-10 rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-slate-100 outline-none focus:border-sky-400"><option value="AUTO">{displayLabel("AUTO", isArabic ? "ar" : "en")}</option><option value="CATALOG_ONLY">{displayLabel("CATALOG_ONLY", isArabic ? "ar" : "en")}</option><option value="SUPPLY_INSTALL_SYSTEM">{displayLabel("SUPPLY_INSTALL_SYSTEM", isArabic ? "ar" : "en")}</option><option value="DRAWING">{displayLabel("DRAWING", isArabic ? "ar" : "en")}</option></select></label>
            </div>
          </details>
          <button type="button" onClick={newRequest} className="rounded-lg px-2 py-2 text-xs font-medium text-slate-500 outline-none hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-sky-400">{isArabic ? "طلب جديد" : "New Request"}</button>
        </div>

        <div data-testid="commercial-composer-input" className="sticky bottom-3 z-20 order-5 min-w-0 rounded-[1.6rem] border border-white/10 bg-slate-900/95 p-2 shadow-[0_24px_80px_-28px_rgba(0,0,0,.85)] backdrop-blur-xl transition focus-within:border-sky-400/45 focus-within:shadow-[0_24px_90px_-25px_rgba(14,165,233,.28)] motion-reduce:transition-none sm:p-3">
          {attachment ? <div className="mb-2 flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs"><span className="truncate text-slate-300">{attachment.name}</span><button type="button" onClick={() => setAttachment(null)} className="ms-auto shrink-0 rounded-md text-rose-300 outline-none focus-visible:ring-2 focus-visible:ring-sky-400">{isArabic ? "إزالة" : "Remove"}</button></div> : null}
          <textarea ref={promptInputRef} id="sales-prompt-input" value={prompt}
            onChange={(e) => { analysisGeneration.current++; setIsGenerating(false); setPendingUserMessage(null); setPendingResearch(false); setPrompt(e.target.value); replySourceRef.current = "TEXT"; if (workingDraft) setResultStale(true); }}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && hasTextToProcess) { event.preventDefault(); handlePrimaryAction(); } }}
            rows={1}
            placeholder={isArabic ? "اكتب طلبك أو تحدث…" : "Message VOKA or use voice…"}
            className="block max-h-44 min-h-12 w-full resize-none overflow-y-auto bg-transparent px-3 py-3 text-[15px] leading-6 text-white outline-none placeholder:text-slate-500" />
          <div className="flex items-center gap-1.5 px-1 pb-1">
            <label htmlFor="commercial-attachment" className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-slate-400 outline-none transition hover:bg-white/[0.06] hover:text-white focus-within:ring-2 focus-within:ring-sky-400 motion-reduce:transition-none"><Icon name="attach" /><span className="sr-only">{isArabic ? "إرفاق ملف تجاري" : "Attach commercial file"}</span></label>
            <input id="commercial-attachment" aria-label={isArabic ? "إرفاق ملف تجاري" : "Attach commercial file"} type="file" accept="application/pdf,.pdf" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} className="sr-only" />
            <span className="hidden text-[11px] text-slate-600 sm:inline">{isArabic ? "مفتاح الإدخال للإرسال · العالي مع الإدخال لسطر جديد" : "Enter to send · Shift+Enter for a new line"}</span>
            <button type="button" data-testid="primary-voice-action" title={voiceUnavailable ? (isArabic ? "الإدخال الصوتي غير مدعوم" : "Voice input is not supported") : undefined} aria-label={primaryActionLabel} disabled={isGenerating || isVoiceProcessing || (voiceUnavailable && !hasTextToProcess)} onClick={handlePrimaryAction} className="ms-auto inline-flex min-h-10 items-center gap-2 rounded-full bg-sky-300 px-3.5 py-2 text-xs font-semibold text-slate-950 outline-none transition hover:bg-sky-200 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none">
              <Icon name={hasTextToProcess || isListening ? "send" : "mic"} className="h-4 w-4" /><span>{primaryActionLabel}</span>
            </button>
          </div>
          {voice.transcript.interim && (
            <div className="mt-1 flex items-center gap-2 rounded-xl bg-sky-950/60 p-2.5 text-xs text-sky-200">
              <span className="h-2 w-2 animate-ping rounded-full bg-sky-400 motion-reduce:animate-none" />
              <span className="font-medium">{isArabic ? "جاري الاستماع:" : "Listening:"}</span>
              <span className="italic text-slate-300">{voice.transcript.interim}</span>
            </div>
          )}
        </div>



        {workingDraft?.activeQuestion && <div className="order-2"><ActiveFieldQuestion draft={workingDraft} isArabic={isArabic} disabled={isGenerating} onAnswer={(answer) => void advanceConversation(answer.value, "CHIP", undefined, answer)} /></div>}
        {workingDraft && !resultStale ? <div className="order-2 space-y-2" data-testid="compact-conversation-actions">
          <div className="flex flex-wrap gap-2">{workingDraft.customerResolution?.candidates.map((candidate) => <button type="button" key={candidate.id} disabled={isGenerating} onClick={() => advanceConversation(`${isArabic ? "العميل" : "Customer"} ${candidate.name}`, "CHIP", { ...workingDraft.selection, customer: { id: candidate.id, name: candidate.name } })} className="rounded-xl border border-sky-400/30 px-3 py-2 text-sm text-sky-200">{candidate.name}</button>)}</div>
          {workingDraft.canonicalProposal?.lines.filter((line) => line.resolutionStatus === "AMBIGUOUS").map((line) => <CommercialCatalogChoices key={line.componentKey ?? line.itemName} line={line} isArabic={isArabic} disabled={isGenerating} onSelect={(candidate) => void advanceConversation(candidate.name, "CHIP", { ...workingDraft.selection, catalog: { ...workingDraft.selection?.catalog, [line.componentKey ?? line.itemName]: candidate } })} />)}
          {!workingDraft.activeQuestion && workingDraft.clarification && workingDraft.customerResolution?.status !== "AMBIGUOUS" ? <p className="text-sm text-white">{isArabic ? workingDraft.clarification.ar : workingDraft.clarification.en}</p> : null}
          {workingDraft.customerResolution?.status !== "AMBIGUOUS" ? <div className="flex flex-wrap gap-2">{workingDraft.clarification?.suggestions.map((chip, index) => <button key={index} type="button" disabled={isGenerating} onClick={() => advanceConversation(isArabic ? chip.ar : chip.en, "CHIP")} className="rounded-xl border border-sky-400/30 px-3 py-2 text-xs">{isArabic ? chip.ar : chip.en}</button>)}</div> : null}
          {workingDraft.proposedCustomerName ? <p data-testid="proposed-customer-note" className="text-xs text-sky-200">{isArabic ? "العميل غير مسجل حاليًا وسيستمر في المسودة كما هو." : "Customer is not registered yet and will be carried into the draft as entered."}</p> : null}
        </div> : null}
        {workingDraft && !resultStale ? <div className="order-3"><CompactLiveResult draft={workingDraft} isArabic={isArabic} onOpenForReview={() => void openForHumanReview()} /></div> : null}

        {recorded.isSupported && (recorded.state === "RECORDING" || recorded.state === "TRANSCRIBING") && <div className="order-4 flex h-10 items-center justify-center gap-1 rounded-xl bg-sky-500/5" aria-label={isArabic ? "موجة التسجيل الصوتي" : "Audio recording waveform"}>{recorded.waveform.map((level, index) => <span key={index} className="w-1 rounded-full bg-sky-400 transition-[height] duration-100 motion-reduce:transition-none" style={{ height: `${Math.max(5, level * 34)}px` }} />)}</div>}

        {/* Accessible Voice Status Live Region */}
        {getVoiceStatusMessage() && (
          <div
            role="status"
            aria-live="polite"
            className={`order-4 rounded-xl p-2 text-xs flex flex-wrap items-center gap-2 ${
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
        {!workingDraft && !pendingUserMessage ? <div className="order-0 mt-auto flex flex-wrap items-center gap-2 px-2 py-4">
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
        </div> : null}

        {error && (
          <div role="alert" className="order-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error === "reattach" ? (isArabic ? "أعد إرفاق ملف الرسم لفتحه للمراجعة." : "Reattach the drawing file to open it for review.") : error === "review" ? (isArabic ? "تعذر فتح نموذج المراجعة. حاول مرة أخرى." : "Unable to open the review form. Please try again.") : (isArabic ? "تعذر فهم الطلب. حاول مرة أخرى؛ النص محفوظ ويمكنك تعديله." : "Unable to understand the request. Please try again; your text is preserved and editable.")}
          </div>
        )}


      </div>

    </div>
  );
}
