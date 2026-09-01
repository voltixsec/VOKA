// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { applyWorkspaceDefaults, applyWorkspacePatches, buildSystemConfigurationGraph, synchronizeWorkspace, type ConfirmedFact } from "@/src/application/conversation-runtime";
import { MessageBubble, plainConversationText } from "../MessageBubble";
import { SolutionWorkspace } from "../SolutionWorkspace";

const fact = (key: string, value: string | number, provenance: ConfirmedFact["provenance"] = "USER_EXPLICIT"): ConfirmedFact => ({ key, value, provenance, evidence: String(value), updatedAt: "2026-08-31T00:00:00.000Z" });

describe("conversation presentation", () => {
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
    workspace = applyWorkspaceDefaults(workspace, { currencyCode: "KWD", termsAr: "LONG LEGAL AR", termsEn: "LONG LEGAL EN" }, "SUPPLY_AND_INSTALLATION");
    render(<SolutionWorkspace graph={graph} workspace={workspace} isArabic={false} onOpenDraft={vi.fn()} draftLoading={false} />);
    expect(screen.getByText("Commercial context")).toBeTruthy();
    expect(screen.getByText("North Co")).toBeTruthy();
    expect(screen.getByText("Site and responsibilities")).toBeTruthy();
    expect(screen.getByText("Clear ceiling access")).toBeTruthy();
    expect(screen.getByText("Provide power")).toBeTruthy();
    expect(screen.getAllByText("Supply and installation").length).toBeGreaterThan(0);
    expect(screen.queryByText("SUPPLY_AND_INSTALLATION")).toBeNull();
    expect(screen.queryByText("LONG LEGAL EN")).toBeNull();
  });

  it("shows researched brand, model, source link, relevance, and approval state", () => {
    const facts = { "system.identity": fact("system.identity", "CCTV") };
    const base = buildSystemConfigurationGraph(facts);
    const candidate = { id: "p1", componentKey: "CCTV_CAMERAS", name: "Acme Camera", nameAr: null, nameEn: "Acme Camera", brand: "Acme", model: "X1", sku: null, price: null, source: "RESEARCHED" as const, sourceUrl: "https://manufacturer.example/x1", sourceTitle: "Official Acme X1", jurisdictionRelevance: "Available through a Kuwait distributor" };
    const graph = { ...base, candidateProducts: [candidate] };
    const workspace = { ...synchronizeWorkspace(undefined, facts, graph, "2026-09-01T00:00:00.000Z"), products: { candidates: [candidate], approvedCandidateIds: [] } };
    const { rerender } = render(<SolutionWorkspace graph={graph} workspace={workspace} isArabic={false} onOpenDraft={vi.fn()} draftLoading={false} />);
    expect(screen.getByText("Acme - X1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Official Acme X1" })).toHaveAttribute("href", "https://manufacturer.example/x1");
    expect(screen.getByText("Available through a Kuwait distributor")).toBeTruthy();
    expect(screen.getByText("Not approved")).toBeTruthy();
    rerender(<SolutionWorkspace graph={graph} workspace={{ ...workspace, products: { ...workspace.products, approvedCandidateIds: ["p1"] } }} isArabic={false} onOpenDraft={vi.fn()} draftLoading={false} />);
    expect(screen.getByText("Approved")).toBeTruthy();
  });
});
