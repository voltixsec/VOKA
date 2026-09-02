// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SalesAssistantPage from "../page";
import type { ConversationRuntimeState } from "@/src/application/conversation-runtime";

const mocks = vi.hoisted(() => ({ push: vi.fn(), isArabic: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: mocks.isArabic }) }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); mocks.push.mockReset(); mocks.isArabic = false; });

const state = (reply = "That makes sense. Let’s start with the vehicle type and number of stops."): ConversationRuntimeState => ({
  runtimeId: "runtime-1", version: 1, locale: "en",
  messages: [{ id: "u1", role: "USER", text: "I need a vehicle elevator for National Telecom in Kuwait", source: "TEXT", createdAt: "2026-01-01" }, { id: "a1", role: "ASSISTANT", text: reply, source: "AI", createdAt: "2026-01-01" }],
  confirmedFacts: {
    "system.identity": { key: "system.identity", value: "Vehicle Elevator", provenance: "USER_EXPLICIT", evidence: "vehicle elevator", updatedAt: "2026-01-01" },
    "customer.name": { key: "customer.name", value: "National Telecom", provenance: "USER_EXPLICIT", evidence: "National Telecom", updatedAt: "2026-01-01" },
    "system.jurisdiction": { key: "system.jurisdiction", value: "Kuwait", provenance: "USER_EXPLICIT", evidence: "Kuwait", updatedAt: "2026-01-01" },
  },
  candidateFacts: [], unresolvedImportantQuestions: ["vehicle class"], toolResults: [], solutionReadiness: "EXPLORING", transitionState: "EXPLORING", compactMemory: "Vehicle elevator requested", suggestedReplies: ["SUV too"], handoff: null,
});

const proposedState = (): ConversationRuntimeState => ({ ...state("The solution is mature enough to prepare a quotation."), solutionReadiness: "AWAITING_USER_CONFIRMATION", transitionState: "PROPOSED" });
const readyToProposeState = (): ConversationRuntimeState => ({ ...proposedState(), transitionState: "EXPLORING" });
const handoffState = (): ConversationRuntimeState => ({
  ...state("I’ll open a draft quotation from the confirmed information."), solutionReadiness: "READY_FOR_HANDOFF", transitionState: "COMMERCIAL_HANDOFF",
  handoff: { runtimeId: "runtime-1", confirmedFacts: state().confirmedFacts, commercialLines: [], toolEvidence: [], createdAt: "2026-08-31T00:00:00.000Z" }, handoffToken: "signed-handoff",
});

describe("Sales Assistant clean runtime UI", () => {
  it("does not advertise Draft readiness for a non-quotation target in a hydrated session", async () => {
    const runtime = handoffState();
    runtime.confirmedFacts["document.target"] = { key: "document.target", value: "INVOICE", provenance: "USER_EXPLICIT", evidence: "Invoice", updatedAt: "2026-09-02" };
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(runtime));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    expect(await screen.findByRole("button", { name: "Prepare quotation" })).toBeDisabled();
    expect(screen.queryByText("Draft-open prerequisites complete")).toBeNull();
    expect(screen.getByText(/Required before opening Draft: Document type/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps Arabic persistence failures localized and retryable", async () => {
    mocks.isArabic = true;
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(handoffState()));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: "CREATE_FAILED", message: "persistence is not connected to the clean conversation runtime yet" } }) }));
    render(<SalesAssistantPage />);
    fireEvent.click(await screen.findByRole("button", { name: "جهّز العرض" }));
    expect(await screen.findByText("تعذر إنشاء مسودة العرض. يمكنك المحاولة مرة أخرى.")).toBeTruthy();
    expect(screen.queryByText(/persistence is not connected/)).toBeNull();
    expect(screen.getByRole("button", { name: "جهّز العرض" })).not.toBeDisabled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it.each([false, true])("does not leak persistence diagnostics and retains retry after failure (HTTP success=%s)", async (ok) => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(handoffState()));
    const diagnostic = "persistence is not connected to the clean conversation runtime yet";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => ({ error: { message: diagnostic }, data: { status: "CREATE_FAILED", message: diagnostic } }) }));
    render(<SalesAssistantPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare quotation" }));
    expect(await screen.findByText("The quotation draft could not be created. You can try again.")).toBeTruthy();
    expect(screen.queryByText(diagnostic)).toBeNull();
    expect(screen.getByRole("button", { name: "Prepare quotation" })).not.toBeDisabled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("renders the AI reply verbatim and projects confirmed state through the unchanged chat shell", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: state() }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "I need a vehicle elevator" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    expect(await screen.findByText("That makes sense. Let’s start with the vehicle type and number of stops.")).toBeTruthy();
    expect(screen.getAllByText("Vehicle Elevator").length).toBeGreaterThan(0);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/conversation-runtime");
    expect(fetchMock.mock.calls.flatMap(([calledUrl]) => [calledUrl])).not.toEqual(expect.arrayContaining(["/api/ai/commercial-conversation", "/api/ai/sales-assistant/draft"]));
    expect(JSON.parse(options.body)).toMatchObject({ source: "TEXT", state: null });
  });

  it("new request clears only the clean runtime state", async () => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(state()));
    sessionStorage.setItem("unrelated", "preserve");
    render(<SalesAssistantPage />);
    await waitFor(() => expect(screen.getAllByText("Vehicle Elevator").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "New Request" }));
    expect(sessionStorage.getItem("voka_conversation_runtime_state_v1")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("preserve");
  });

  it.each([proposedState, readyToProposeState])("keeps the quotation CTA visible when the solution is ready to propose", async (runtime) => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(runtime()));
    render(<SalesAssistantPage />);
    expect(await screen.findByRole("button", { name: "Prepare quotation" })).toBeTruthy();
  });

  it("uses the explicit CTA to prepare a signed handoff, create one draft, and open the editor", async () => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(proposedState()));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { handoffToken: "signed-handoff" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: "CREATED", quotationId: "quotation-1", navigationTarget: "/dashboard/quotations/quotation-1/edit" } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare quotation" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/quotations/quotation-1/edit"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/conversation-runtime/prepare-handoff");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/ai/conversation-runtime/quotation-draft");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ handoffToken: "signed-handoff", locale: "en" });
  });

  it("natural prepare language remains in chat and never persists or navigates", async () => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(proposedState()));
    const requested = { ...proposedState(), transitionState: "TRANSITION_REQUESTED" as const, messages: [...proposedState().messages, { id: "u2", role: "USER" as const, text: "Yes, prepare it", source: "TEXT" as const, createdAt: "2026-01-01" }, { id: "a2", role: "ASSISTANT" as const, text: "The draft is ready whenever you choose to open it.", source: "AI" as const, createdAt: "2026-01-01" }] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: requested }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Yes, prepare it" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    expect(await screen.findByText("The draft is ready whenever you choose to open it.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Prepare quotation" })).toBeTruthy();
  });

  it("does not dead-end in COMMERCIAL_HANDOFF and retries persistence without another brain turn", async () => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(handoffState()));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: "CREATED", quotationId: "quotation-direct", navigationTarget: "/dashboard/quotations/quotation-direct/edit" } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare quotation" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/quotations/quotation-direct/edit"));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/conversation-runtime/quotation-draft");
  });

  it.each(["CREATED", "EXISTING"])("navigates an %s persisted handoff to the existing quotation editor", async (status) => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(handoffState()));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status, quotationId: "quotation-1", navigationTarget: "/dashboard/quotations/quotation-1/edit" } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare quotation" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/quotations/quotation-1/edit"));
    expect(screen.getByTestId("draft-readiness")).toBeTruthy();
  });

  it("prevents repeated confirmation from creating duplicate drafts", async () => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(proposedState()));
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => { release = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    const button = await screen.findByRole("button", { name: "Prepare quotation" });
    fireEvent.click(button); fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release({ ok: false, json: async () => ({ error: { message: "stop" } }) });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });

  it("opens only after strict customer and jurisdiction prerequisites are present", async () => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(proposedState()));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { handoffToken: "pending-customer" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: "CREATED", quotationId: "quotation-pending-customer", navigationTarget: "/dashboard/quotations/quotation-pending-customer/edit" } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare quotation" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/quotations/quotation-pending-customer/edit"));
  });

  it("keeps a usable retry path after failed quotation persistence", async () => {
    sessionStorage.setItem("voka_conversation_runtime_state_v1", JSON.stringify(handoffState()));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "Temporary quotation failure" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: "EXISTING", quotationId: "quotation-retry", navigationTarget: "/dashboard/quotations/quotation-retry/edit" } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare quotation" }));
    expect(await screen.findByText("The quotation draft could not be created. You can try again.")).toBeTruthy();
    expect(screen.queryByText("Temporary quotation failure")).toBeNull();
    const retry = screen.getByRole("button", { name: "Prepare quotation" });
    expect(retry).toHaveProperty("disabled", false);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/quotations/quotation-retry/edit"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
