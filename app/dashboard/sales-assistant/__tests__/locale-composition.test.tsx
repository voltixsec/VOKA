// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SalesAssistantPage from "../page";
import { CctvSystemTemplate } from "@/src/domain/smart-system/CctvSystemTemplate";

const ui = vi.hoisted(() => ({ isArabic: false, raw: true, state: "IDLE" }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: ui.isArabic }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/src/infrastructure/voice/browser", () => ({
  useRecordedVoiceInput: () => ({ isSupported: ui.raw, state: ui.state, transcript: "", waveform: [.2, .6, .3], errorMessage: "Internal English transport error", resetRecording: vi.fn() }),
  useVoiceInput: () => ({ isSupported: true, state: ui.state, transcript: { final: "", interim: "" }, errorMessage: "خطأ داخلي لا يعرض", resetVoiceInput: vi.fn() }),
}));

function expectLocale(container: HTMLElement) {
  // Inspect expanded/collapsed content AND accessible names/placeholders/options.
  const content = [container.textContent, ...Array.from(container.querySelectorAll("[aria-label], [title], [placeholder]")).map((node) => ["aria-label", "title", "placeholder"].map((attr) => node.getAttribute(attr)).join(" "))].join(" ");
  const withoutTechnical = content.replace(/\b(?:CCTV|NVR|DVR|PoE|RJ45|IP|4K|4MP|Cat6|TB|KWD)\b/g, "");
  expect(withoutTechnical).not.toMatch(ui.isArabic ? /[a-z]/i : /[\u0600-\u06ff]/);
  expect(content).not.toMatch(/AUTO|TRANSCRIPT_READY|READY_FOR_REVIEW|NEEDS_CONFIRMATION|RULE_CALCULATED|AI_ESTIMATED/);
}

function draft() {
  const system = new CctvSystemTemplate().calculate({ cameraCount: 36, includeInstallation: true });
  const lines = system.components.map((component) => ({
    itemName: component.nameAr, itemNameAr: component.nameAr, itemNameEn: component.nameEn,
    quantity: component.quantity, unitName: component.unit, requestedUnitText: component.unit,
    provenance: component.provenance, formulaExplanation: component.formulaExplanation, formulaExplanationAr: component.formulaExplanationAr,
    resolutionStatus: "CUSTOM", catalogCandidates: [], unitPrice: null,
  }));
  return {
    id: "same-draft", operation: "QUOTATION", documentMode: "AUTO", buildMode: "AUTO",
    fields: { lines, customerMention: null }, contextText: "CCTV NVR PoE RJ45 4MP", turns: [],
    customerResolution: { status: "UNRESOLVED", candidates: [] },
    canonicalProposal: { smartSystem: system, lines, estimateNotice: true, proposal: { currencyCode: "KWD" } },
    missingRequired: [{ key: "customer", labelAr: "العميل", labelEn: "Customer" }],
    recommended: [{ key: "paymentTerms", labelAr: "شروط الدفع", labelEn: "Payment terms" }],
    status: "NEEDS_CLARIFICATION",
    clarification: { ar: "من هو العميل؟", en: "Who is the customer?", suggestions: [{ ar: "أريد إضافة خدمة", en: "I need a service", reply: "أريد إضافة خدمة" }] },
    requiresHumanReview: true, executed: false,
  };
}

beforeEach(() => { sessionStorage.clear(); ui.state = "IDLE"; ui.raw = true; });
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe.each([true, false])("compact assistant locale (Arabic=%s)", (isArabic) => {
  beforeEach(() => { ui.isArabic = isArabic; });

  it("localizes controls, samples, required/optional fields, expanded engineering details and readiness", async () => {
    const first = draft();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: first }) });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<SalesAssistantPage />);
    expectLocale(container);
    expect(screen.getAllByRole("option", { name: isArabic ? "تلقائي" : "Auto" })).toHaveLength(2);
    for (const sample of [isArabic ? "طلب كاميرات مراقبة" : "CCTV request", isArabic ? "طلب توريد أجهزة NVR" : "NVR supply"]) {
      fireEvent.click(screen.getByRole("button", { name: sample }));
      const text = (screen.getByRole("textbox") as HTMLTextAreaElement).value;
      expect(text.replace(/IP|4K|KWD|NVR/g, "")).not.toMatch(isArabic ? /[a-z]/i : /[\u0600-\u06ff]/);
    }
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "CCTV NVR PoE RJ45 4MP" } });
    fireEvent.click(screen.getByRole("button", { name: isArabic ? "فهم العملية" : "Understand" }));
    await screen.findByTestId("commercial-conversation");
    expectLocale(container);
    expect(screen.getByText(isArabic ? "مطلوب للإكمال:" : "REQUIRED TO COMPLETE:")).toBeTruthy();
    expect(screen.getByText(isArabic ? /اختياري\/موصى به/ : /Optional\/recommended/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: isArabic ? "فتح للمراجعة البشرية" : "Open for human review" })).toBeNull();
    const ready = { ...first, status: "READY_FOR_REVIEW", missingRequired: [], clarification: null };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: ready }) });
    fireEvent.click(screen.getByRole("button", { name: isArabic ? "أريد إضافة خدمة" : "I need a service" }));
    await screen.findByText(isArabic ? "المسودة جاهزة للمراجعة" : "Draft ready for review");
    expectLocale(container);
    const request = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(request).toMatchObject({ draft: { id: "same-draft" }, replySource: "CHIP", reply: isArabic ? "أريد إضافة خدمة" : "I need a service" });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain(request.reply);
    expect(request.draft.executed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["RECORDING", "TRANSCRIBING", "READY", "ERROR", "PERMISSION_DENIED"])("localizes recorded voice state %s without exposing internal errors", (state) => {
    ui.state = state;
    const { container } = render(<SalesAssistantPage />);
    expectLocale(container);
    if (state === "READY") expect(screen.getByText(isArabic ? "النص جاهز للفهم" : "Transcript ready")).toBeTruthy();
  });

  it.each(["LISTENING", "PROCESSING", "READY", "UNAVAILABLE", "ERROR", "PERMISSION_DENIED"])("localizes browser fallback state %s", (state) => {
    ui.raw = false; ui.state = state;
    expectLocale(render(<SalesAssistantPage />).container);
  });

  it("keeps controls, text and result adjacent with an 8px shared gap and responsive touch controls", () => {
    sessionStorage.setItem("voka_commercial_conversation_draft", JSON.stringify(draft()));
    const { container } = render(<SalesAssistantPage />);
    const composer = screen.getByTestId("commercial-composer");
    const controls = screen.getByTestId("commercial-composer-controls");
    const input = screen.getByTestId("commercial-composer-input");
    const result = screen.getByTestId("commercial-conversation");
    expect(composer.classList.contains("gap-2")).toBe(true);
    expect(composer.classList.contains("p-3")).toBe(true);
    expect(controls.nextElementSibling).toBe(input);
    expect(input.nextElementSibling).toBe(result);
    expect(controls.parentElement).toBe(composer);
    expect(controls.classList.contains("flex-wrap")).toBe(true);
    expect(controls.className).not.toMatch(/\bp-\d|\bmt-\d|\bmb-\d|\bborder\b/);
    expect(screen.getByRole("textbox").className).toContain("block w-full min-w-0");
    for (const select of screen.getAllByRole("combobox")) {
      expect(select.className).toContain("min-h-11 w-full min-w-0");
      expect(select.parentElement?.className).toContain("basis-[calc(50%-0.25rem)]");
    }
    expect(container.firstElementChild?.getAttribute("dir")).toBe(isArabic ? "rtl" : "ltr");
    if (isArabic) expect(container.firstElementChild?.className).toContain("font-[var(--font-cairo)]");
  });

  it("localizes API errors and preserves editable user text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: isArabic ? "English server error" : "خطأ الخادم" } }) }));
    const { container } = render(<SalesAssistantPage />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "NVR" } });
    fireEvent.click(screen.getByRole("button", { name: isArabic ? "فهم العملية" : "Understand" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expectLocale(container);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("NVR");
  });

  it("localizes the request-update marker that may return in restored context", async () => {
    sessionStorage.setItem("voka_commercial_conversation_draft", JSON.stringify(draft()));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: draft() }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "DVR" } });
    fireEvent.click(screen.getByRole("button", { name: isArabic ? "فهم العملية" : "Understand" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reply).toBe(isArabic ? "تحديث الطلب: DVR" : "Updated request: DVR");
  });
});
