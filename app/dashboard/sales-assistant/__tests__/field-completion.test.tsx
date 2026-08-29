// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SalesAssistantPage from "../page";
import type { AudioRecorderOptions, IRawAudioRecorder } from "@/src/infrastructure/voice/browser";

const mocks = vi.hoisted(() => ({ isArabic: true, push: vi.fn() }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: mocks.isArabic }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

class Recorder implements IRawAudioRecorder {
  options: AudioRecorderOptions = {};
  isSupported() { return true; }
  async start(options: AudioRecorderOptions) { this.options = options; options.onStateChange?.("RECORDING"); }
  stop() { this.options.onComplete?.(new Blob(["audio"], { type: "audio/webm" })); }
  reset() {}
}

function draft(field: "projectName" | "attentionName" | null = "projectName") {
  const questions = { projectName: { ar: "ما اسم المشروع؟", en: "What is the project name?" }, attentionName: { ar: "المستند بعناية من؟", en: "Who should the document be addressed to?" } };
  return {
    id: "same-draft", locale: mocks.isArabic ? "ar" : "en", operation: "QUOTATION", documentMode: "QUOTATION", buildMode: "AUTO", completionVersion: 1,
    fields: { customerId: "c1", customerMention: null, currencyCode: "KWD", paymentTerms: "Cash", scopeType: "SUPPLY_ONLY", sourceReference: null, lines: [] },
    attachment: null, recommended: [], requiresHumanReview: true, executed: false,
    canonicalProposal: null, customerResolution: { status: "MATCHED", candidates: [] },
    turns: [{ source: "TEXT", text: "CCTV" }], contextText: "CCTV",
    activeQuestion: field ? { field, ...questions[field], allowNotApplicable: true } : null,
    missingRequired: field ? [{ key: field, labelAr: "اسم المشروع", labelEn: "Project name", required: true }] : [],
    phase: field ? "FIELD_ANSWER_PENDING" : "DRAFT_READY_FOR_REVIEW",
    status: field ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW", clarification: null,
  };
}

describe("one active conversational field", () => {
  beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); mocks.isArabic = true; });

  it.each([true, false])("keeps one localized question visible while editing; chip submits immediately (Arabic=%s)", async (ar) => {
    mocks.isArabic = ar;
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: draft() }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: draft("attentionName") }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "CCTV" } });
    fireEvent.click(screen.getByRole("button", { name: ar ? "ابدأ الطلب" : "Start Request" }));
    const question = await screen.findByTestId("active-field-question");
    expect(question.textContent).toContain(ar ? "ما اسم المشروع؟" : "What is the project name?");
    expect(question.textContent).not.toMatch(ar ? /project|Not applicable|Understand|READY/ : /[\u0600-\u06FF]/);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "new answer" } });
    expect(screen.getAllByTestId("active-field-question")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: ar ? "لا ينطبق" : "Not applicable" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.answer).toEqual({ field: "projectName", action: "NOT_APPLICABLE", value: ar ? "لا ينطبق" : "Not applicable" });
    expect(body.replySource).toBe("CHIP");
    expect(body.draft.id).toBe("same-draft");
    await screen.findByText(ar ? "المستند بعناية من؟" : "Who should the document be addressed to?");
    expect(screen.getByTestId("commercial-composer").className).toContain("gap-2");
    expect(screen.getByTestId("commercial-composer-controls").className).toContain("flex-wrap");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("Voice V2 Stop answers the active field immediately and the next typed answer shares context", async () => {
    mocks.isArabic = false;
    const recorder = new Recorder();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: draft() }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: draft("attentionName") }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: draft(null) }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage customAudioRecorder={recorder} customTranscribe={vi.fn().mockResolvedValue("مصنع الشويخ الجديد")} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "CCTV" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    await screen.findByText("What is the project name?");
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Start by Voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop & Send" }));
    await waitFor(() => expect(textarea.value).toBe("مصنع الشويخ الجديد"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Draft ready for review")).toBeNull();
    await screen.findByText("Who should the document be addressed to?");
    const voiceBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(voiceBody).toMatchObject({ replySource: "VOICE", reply: "مصنع الشويخ الجديد", answer: { field: "projectName", value: "مصنع الشويخ الجديد" } });
    fireEvent.change(textarea, { target: { value: "المهندس محمد خالد" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    await screen.findByText("Draft ready for review");
    const textBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(textBody).toMatchObject({ replySource: "TEXT", answer: { field: "attentionName", value: "المهندس محمد خالد" }, draft: { id: "same-draft" } });
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "New Request" }));
    expect(screen.queryByTestId("active-field-question")).toBeNull();
    expect(sessionStorage.getItem("voka_commercial_conversation_draft")).toBeNull();
    expect(screen.getByTestId("commercial-composer").getAttribute("data-commercial-state")).toBe("COMPOSING");
  });

  it("restores the target and reanalyzes unchanged text without storing it as a project answer", async () => {
    mocks.isArabic = false;
    sessionStorage.setItem("voka_commercial_conversation_draft", JSON.stringify(draft()));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: draft() }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    await screen.findByText("What is the project name?");
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ reanalyze: true, draft: { id: "same-draft" } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).answer).toBeUndefined();
  });
});
