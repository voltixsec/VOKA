// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SalesAssistantPage from "../page";
import type { ConversationRuntimeState } from "@/src/application/conversation-runtime";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

const runtimeState = (userText: string, reply: string): ConversationRuntimeState => ({
  runtimeId: "runtime-1", version: 1, locale: "en",
  messages: [{ id: "u1", role: "USER", text: userText, source: "TEXT", createdAt: "2026-09-10", intent: "ATTACHMENT_ANALYSIS", attachment: { id: "artifact-1", name: "boq.pdf", type: "application/pdf" } }, { id: "a1", role: "ASSISTANT", text: reply, source: "AI", createdAt: "2026-09-10" }],
  confirmedFacts: {}, candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], solutionReadiness: "EXPLORING", transitionState: "EXPLORING", compactMemory: "", suggestedReplies: [], handoff: null,
});

describe("Sales Assistant attachment-only submission", () => {
  beforeEach(() => { mocks.push.mockReset(); sessionStorage.clear(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("uploads the file to the tenant artifact endpoint, then sends an explicit attachment-only turn without fake user prose", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { artifact: { id: "artifact-1", originalFilename: "boq.pdf", mimeType: "application/pdf", sizeBytes: 8, processingState: "TEXT_EXTRACTED", citations: [] }, idempotent: false } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: runtimeState("📎 Attachment: boq.pdf", "I read the machine-extractable text of boq.pdf. What would you like to do with this file?") }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByLabelText("Attach commercial file"), { target: { files: [new File(["%PDF-1.7"], "boq.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("textbox")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe("/api/source-artifacts");
    expect(uploadInit.method).toBe("POST");
    const form = uploadInit.body as FormData;
    expect(form.get("file")).toBeInstanceOf(File);
    expect(form.get("context")).toBe("SALES_ASSISTANT");
    const [turnUrl, turnInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(turnUrl).toBe("/api/ai/conversation-runtime");
    const turn = JSON.parse(String(turnInit.body));
    expect(turn.message).toBe("");
    expect(turn.attachment).toEqual({ id: "artifact-1", name: "boq.pdf", type: "application/pdf", size: 8 });
    expect(await screen.findByText(/I read the machine-extractable text of boq.pdf/)).toBeInTheDocument();
    expect(screen.getByText("📎 Attachment: boq.pdf")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("does not submit anything when there is neither text nor an attachment", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps text plus attachment as a normal user message with the attachment reference", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { artifact: { id: "artifact-2", originalFilename: "tender.pdf", mimeType: "application/pdf", sizeBytes: 8 }, idempotent: false } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { ...runtimeState("Price this tender", "Received."), messages: [{ id: "u1", role: "USER", text: "Price this tender", source: "TEXT", createdAt: "2026-09-10" }, { id: "a1", role: "ASSISTANT", text: "Received.", source: "AI", createdAt: "2026-09-10" }] } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByLabelText("Attach commercial file"), { target: { files: [new File(["%PDF-1.7"], "tender.pdf", { type: "application/pdf" })] } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Price this tender" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const turn = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(turn).toMatchObject({ message: "Price this tender", attachment: { id: "artifact-2", name: "tender.pdf" } });
    expect(await screen.findByText("Received.")).toBeInTheDocument();
  });
});
