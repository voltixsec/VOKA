// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { applyWorkspaceDefaults, applyWorkspacePatches, buildSystemConfigurationGraph, projectRuntimeSummary, synchronizeWorkspace, type ConfirmedFact } from "@/src/application/conversation-runtime";
import { MessageBubble, plainConversationText } from "../MessageBubble";
import { SolutionWorkspace } from "../SolutionWorkspace";
import { ContextSummaryCard } from "../ContextSummaryCard";

const fact = (key: string, value: string | number, provenance: ConfirmedFact["provenance"] = "USER_EXPLICIT"): ConfirmedFact => ({ key, value, provenance, evidence: String(value), updatedAt: "2026-08-31T00:00:00.000Z" });

describe("conversation presentation", () => {
  it("opens a customer-optional Draft while clearly labelling pending commercial work as non-blocking", () => {
    const facts = { "system.identity": fact("system.identity", "Gypsum board"), "system.areaM2": fact("system.areaM2", 2000), "system.layersCount": fact("system.layersCount", 1) };
    const onOpenDraft = vi.fn();
    const { rerender } = render(<SolutionWorkspace graph={buildSystemConfigurationGraph(facts)} isArabic={false} onOpenDraft={onOpenDraft} draftLoading={false} />);
    expect(screen.getByRole("button", { name: "Prepare quotation" })).toBeEnabled();
    expect(screen.queryByText("Required before opening Draft: Customer")).toBeNull();
    expect(screen.getByText(/Pending commercial work \(does not block Draft\):/)).toHaveTextContent("Pricing");
    fireEvent.click(screen.getByRole("button", { name: "Prepare quotation" }));
    expect(onOpenDraft).toHaveBeenCalledOnce();
    const graph = buildSystemConfigurationGraph({ ...facts, "customer.name": fact("customer.name", "Proposed Customer") });
    rerender(<SolutionWorkspace graph={graph} isArabic={false} onOpenDraft={onOpenDraft} draftLoading={false} />);
    expect(screen.getByRole("button", { name: "Prepare quotation" })).toBeEnabled();
    expect(screen.queryByText("Required before opening Draft: Customer")).toBeNull();
  });
  it("renders the Vehicle Elevator workspace honestly: known facts, no BOM sections, explicit engineering review state, Draft allowed", () => {
    const graph = buildSystemConfigurationGraph({ "system.identity": fact("system.identity", "مصعد سيارات"), "system.quantity": fact("system.quantity", 1), "system.numberOfStops": fact("system.numberOfStops", 6) });
    render(<SolutionWorkspace graph={graph} isArabic={false} onOpenDraft={vi.fn()} draftLoading={false} />);
    expect(screen.getByRole("heading", { name: "Vehicle elevator" })).toBeInTheDocument();
    expect(screen.queryByText("Engineering / procurement BOM")).toBeNull();
    expect(screen.queryByText("Sales BOM")).toBeNull();
    expect(screen.getByTestId("engineering-state")).toHaveAttribute("data-engineering-state", "ENGINEERING_REVIEW_REQUIRED");
    expect(screen.getByText("Engineering components and elevator drawing")).toBeInTheDocument();
    expect(screen.getByText(/Pending commercial work \(does not block Draft\):/)).toHaveTextContent("Engineering components");
    expect(screen.getByRole("button", { name: "Prepare quotation" })).toBeEnabled();
  });
  it("localizes raw scope enums at the compact-summary boundary", () => {
    render(<ContextSummaryCard isArabic={false} result={{ summary: [{ key: "scope.type", labelAr: "النطاق", labelEn: "Scope", value: "SUPPLY_AND_INSTALLATION" }], stillNeeded: [], evidence: [], commercial: { draftReady: false } }} />);
    expect(screen.getByText("Supply and Installation")).toBeTruthy();
    expect(screen.queryByText("SUPPLY_AND_INSTALLATION")).toBeNull();
  });

  it("deduplicates equivalent evidence URLs before rendering", () => {
    const summary = projectRuntimeSummary({
      confirmedFacts: { "system.identity": fact("system.identity", "CCTV") },
      toolResults: [{ evidence: [
        { title: "Supplier", url: "https://www.utechkw.com/products/hikvision/hikvision-dvr-nvr/?utm_source=chat", publisher: "utechkw.com" },
        { title: "Supplier duplicate", url: "https://utechkw.com/products/hikvision/hikvision-dvr-nvr", publisher: "utechkw.com" },
      ] }],
      transitionState: "DISCOVERY",
    } as never);
    expect(summary.evidence).toHaveLength(1);
    render(<ContextSummaryCard isArabic={false} result={summary} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("forces assistant markdown into clean conversational plain text", () => {
    expect(plainConversationText("**Choice**\n| Model | Brand |\n| --- | --- |\n`M-1`")).toBe("Choice\nModel · Brand\n\nM-1");
    render(<MessageBubble role="ASSISTANT" text="**Choice** | Model" isArabic={false} />);
    expect(screen.getByText("Choice · Model")).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it("localizes Arabic readiness statuses and ceramic units without changing internal enums", () => {
    const graph = buildSystemConfigurationGraph({
      "system.identity": fact("system.identity", "سيراميك أرضيات"), "system.jurisdiction": fact("system.jurisdiction", "الكويت"),
      "customer.name": fact("customer.name", "شركة الاختبار"), "system.areaM2": fact("system.areaM2", 450), "system.tileSize": fact("system.tileSize", "60x60"),
      "ceramic.adhesiveBags": fact("ceramic.adhesiveBags", 100, "USER_APPROVED"), "ceramic.groutKg": fact("ceramic.groutKg", 200, "USER_APPROVED"),
      "ceramic.skirtingLm": fact("ceramic.skirtingLm", 132, "USER_APPROVED"),
    });
    const { container } = render(<SolutionWorkspace graph={graph} isArabic onOpenDraft={vi.fn()} draftLoading={false} />);
    const text = container.textContent ?? "";
    expect(text).toContain("كيس"); expect(text).toContain("كجم"); expect(text).toContain("متر طولي"); expect(text).toContain("التسعير"); expect(text).toContain("شروط الدفع");
    expect(text).not.toMatch(/\b(?:Customer|Quantity|Pricing|Payment terms|bag|kg|lm)\b/);
  });

  it("exposes the compact workspace reconciliation action", () => {
    const graph = buildSystemConfigurationGraph({ "system.identity": fact("system.identity", "CCTV") });
    const onSync = vi.fn();
    render(<SolutionWorkspace graph={graph} isArabic={false} onOpenDraft={vi.fn()} onSync={onSync} draftLoading={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Sync from conversation" }));
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("renders governed commercial and site state without dumping legal terms", () => {
    const facts = {
      "system.identity": fact("system.identity", "CCTV"), "customer.name": fact("customer.name", "North Co"),
      "project.name": fact("project.name", "HQ"), "attention.name": fact("attention.name", "Mona"),
      "system.jurisdiction": fact("system.jurisdiction", "Kuwait"), "scope.type": fact("scope.type", "SUPPLY_AND_INSTALLATION"),
      "commercial.payment": fact("commercial.payment", "50% advance"),
    };
    const graph = buildSystemConfigurationGraph(facts);
    let workspace = synchronizeWorkspace(undefined, facts, graph, "2026-09-01T00:00:00.000Z");
    workspace = applyWorkspacePatches(workspace, [
      { operation: "SET", path: "siteAndResponsibilities.siteRequirements", value: ["Clear ceiling access"], evidence: "Clear ceiling access", provenance: "USER_EXPLICIT" },
      { operation: "SET", path: "siteAndResponsibilities.customerResponsibilities", value: ["Provide power"], evidence: "Provide power", provenance: "USER_EXPLICIT" },
    ], "Clear ceiling access and Provide power", "2026-09-01T00:00:00.000Z");
    workspace = applyWorkspaceDefaults(workspace, { currencyCode: "KWD", termsAr: "LONG LEGAL AR", termsEn: "LONG LEGAL EN", payment: null, delivery: null, warranty: null, validity: null }, "SUPPLY_AND_INSTALLATION");
    render(<SolutionWorkspace graph={graph} workspace={workspace} isArabic={false} onOpenDraft={vi.fn()} draftLoading={false} />);
    expect(screen.getByText("Commercial context")).toBeTruthy();
    expect(screen.getByText("North Co")).toBeTruthy();
    expect(screen.getByText("Site and responsibilities")).toBeTruthy();
    expect(screen.getByText("Clear ceiling access")).toBeTruthy();
    expect(screen.getByText("Provide power")).toBeTruthy();
    expect(screen.getAllByText("Supply and Installation").length).toBeGreaterThan(0);
    expect(screen.queryByText("SUPPLY_AND_INSTALLATION")).toBeNull();
    expect(screen.queryByText("LONG LEGAL EN")).toBeNull();
  });

  it("shows researched brand, model, source link, relevance, and approval state", () => {
    const facts = { "system.identity": fact("system.identity", "CCTV") };
    const base = buildSystemConfigurationGraph(facts);
    const candidate = { id: "p1", componentKey: "CCTV_CAMERAS", name: "Acme Camera", nameAr: null, nameEn: "Acme Camera", brand: "Acme", model: "X1", sku: null, price: null, source: "RESEARCHED" as const, sourceUrl: "https://manufacturer.example/x1", sourceTitle: "Official Acme X1", jurisdictionRelevance: "Available through a Kuwait distributor", imageUrl: "https://manufacturer.example/x1.jpg", marketPrice: { priceAmount: 4.25, priceCurrency: "KWD", priceMin: null, priceMax: null, priceUnit: "piece", priceType: "LISTED_RETAIL" as const, priceSourceUrl: "https://manufacturer.example/x1", priceSourceTitle: "Official Acme X1", priceObservedAt: "2026-09-01T00:00:00.000Z" } };
    const graph = { ...base, candidateProducts: [candidate] };
    const workspace = { ...synchronizeWorkspace(undefined, facts, graph, "2026-09-01T00:00:00.000Z"), products: { candidates: [candidate], approvedCandidateIds: [] } };
    const { container, rerender } = render(<SolutionWorkspace graph={graph} workspace={workspace} isArabic={false} onOpenDraft={vi.fn()} draftLoading={false} />);
    expect(screen.getByText("Acme - X1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Official Acme X1" })).toHaveAttribute("href", "https://manufacturer.example/x1");
    expect(screen.getByText("Available through a Kuwait distributor")).toBeTruthy();
    expect(container.querySelector("img")).toHaveAttribute("src", candidate.imageUrl);
    expect(screen.getByText(/4\.250 KWD \/ piece/)).toBeTruthy();
    expect(screen.getByText(/Market reference price/)).toBeTruthy();
    expect(screen.getByTestId("solution-workspace").className).toContain("h-[calc(100vh-5.25rem)]");
    expect(screen.getByText("Not approved")).toBeTruthy();
    rerender(<SolutionWorkspace graph={graph} workspace={{ ...workspace, products: { ...workspace.products, approvedCandidateIds: ["p1"] } }} isArabic={false} onOpenDraft={vi.fn()} draftLoading={false} />);
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("shows product, engineering, and pricing states independently without internal persistence text", () => {
    const facts = { "system.identity": fact("system.identity", "CCTV"), "system.cameraCount": fact("system.cameraCount", 340), "system.resolutionMp": fact("system.resolutionMp", 4) };
    const graph = buildSystemConfigurationGraph(facts);
    const workspace = synchronizeWorkspace(undefined, facts, graph, "2026-09-01T00:00:00.000Z");
    render(<SolutionWorkspace graph={graph} workspace={workspace} isArabic={false} onOpenDraft={vi.fn()} draftLoading={false} />);
    for (const status of screen.getAllByTestId("bom-status-SURVEILLANCE_HDD")) expect(status).toHaveTextContent("Generic · Estimated / review · Pricing pending");
    for (const status of screen.getAllByTestId("bom-status-RACK_CABINET")) expect(status).toHaveTextContent("Generic · Estimated / review · Pricing pending");
    expect(screen.getAllByText(/Estimated quantity: 1/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/persistence is not connected/i)).toBeNull();
  });
});
