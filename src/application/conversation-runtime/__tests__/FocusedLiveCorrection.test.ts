import { describe, expect, it, vi } from "vitest";
import { ConversationRuntime, applyApprovedProductSelection, applyWorkspacePatches, buildSystemConfigurationGraph, constrainDocumentDraftReadiness, renderGovernedResponse, resolveProductSelection, synchronizeWorkspace, type ConversationRuntimeState } from "../index";
import { fact, facts, gypsumCandidates, gypsumScenario, now, proposal } from "./fixtures/gypsum";

describe("focused live commercial correction", () => {
  it("keeps exact Sheetrock board and compound selections, quantities and specifications independent across runtime turns", async () => {
    const { initial, board, compound, final } = await gypsumScenario();
    const line = (state: ConversationRuntimeState, id: string) => state.workspace!.commercialSolution.bom.find((item) => item.id === id)!;
    expect(line(board, "GYPSUM_BOARDS")).toMatchObject({ itemNameEn: "Sheetrock Standard 12.5mm", itemNameAr: "Sheetrock Standard 12.5mm", productSelectionStatus: "SELECTED" });
    expect(line(board, "JOINT_COMPOUND")).toEqual(line(initial, "JOINT_COMPOUND"));
    expect(line(compound, "GYPSUM_BOARDS")).toEqual(line(board, "GYPSUM_BOARDS"));
    expect(line(compound, "JOINT_COMPOUND").itemNameEn).toBe("Sheetrock All Purpose Joint Compound");
    for (const id of ["GYPSUM_BOARDS", "JOINT_COMPOUND"]) {
      expect(line(final, id)).toMatchObject({ quantity: line(initial, id).quantity, unitName: line(initial, id).unitName, description: line(initial, id).description, componentKeys: [id], unitPrice: null, pricingStatus: "PENDING" });
      expect(final.confirmedFacts[`product.selection.${id}.componentKey`].value).toBe(id);
    }
    expect(final.solutionGraph!.salesBom).toEqual(final.workspace!.commercialSolution.bom);
    expect(final.workspace!.products.approvedCandidateIds.sort()).toEqual(["board", "compound"]);
    expect(new Set(final.solutionGraph!.salesBom.map((item) => item.id)).size).toBe(final.solutionGraph!.salesBom.length);
  });

  it.each(["Approve option 1", "اعتمد الخيار 1", "Approve 12.5mm"])("does not fan out a positional or measurement selection: %s", (message) => {
    const graph = { ...buildSystemConfigurationGraph(facts), candidateProducts: gypsumCandidates };
    const result = resolveProductSelection({ graph, confirmed: facts, message, locale: "en", now });
    expect(result.confirmed).toEqual(facts);
  });

  it("rejects a numeric cross-component approval even when the provider guesses a candidate", () => {
    const result = resolveProductSelection({ graph: { ...buildSystemConfigurationGraph(facts), candidateProducts: gypsumCandidates }, confirmed: facts, message: "Approve option 1", locale: "en", now, patches: [{ path: "products.candidates.compound", operation: "APPROVE", value: "compound", provenance: "USER_EXPLICIT", evidence: "Approve option 1" }] });
    expect(result.confirmed).toEqual(facts);
    expect(result.reply).toContain("Which component");
  });

  it("rejects reused candidate IDs and candidates for absent structural slots", () => {
    const graph = buildSystemConfigurationGraph(facts);
    for (const candidates of [[gypsumCandidates[0], { ...gypsumCandidates[1], id: "board" }], [{ ...gypsumCandidates[0], componentKey: "ABSENT" }]]) {
      expect(resolveProductSelection({ graph: { ...graph, candidateProducts: candidates }, confirmed: facts, message: "Approve Standard 12.5mm", locale: "en", now }).confirmed).toEqual(facts);
    }
  });

  it("rejects structural replacements that steal another live component ID or key", () => {
    const graph = buildSystemConfigurationGraph(facts);
    const workspace = synchronizeWorkspace(undefined, facts, graph, now);
    const compound = workspace.engineering.bom.find((line) => line.id === "JOINT_COMPOUND")!;
    for (const replacement of [compound, { ...compound, id: "NEW_BOARD", componentKeys: ["JOINT_COMPOUND"] }]) {
      const next = applyWorkspacePatches(workspace, [{ path: "engineering.bom.GYPSUM_BOARDS", operation: "REPLACE", value: replacement, provenance: "USER_EXPLICIT", evidence: "Approve board" }], "Approve board", now);
      expect(next.commercialSolution.bom).toEqual(workspace.commercialSolution.bom);
    }
  });

  it("does not project an inconsistent selected-product component fact onto another line", () => {
    const line = buildSystemConfigurationGraph(facts).salesBom.find((item) => item.id === "GYPSUM_BOARDS")!;
    const invalid = Object.fromEntries(Object.entries({ name: "Wrong compound", source: "RESEARCHED", componentKey: "JOINT_COMPOUND" }).map(([key, value]) => [`product.selection.GYPSUM_BOARDS.${key}`, fact(`product.selection.GYPSUM_BOARDS.${key}`, value)]));
    expect(applyApprovedProductSelection(line, invalid)).toEqual(line);
  });

  it("allows a customer-free draft but never product, market price or selling price", () => {
    const missing = { "system.identity": facts["system.identity"] };
    expect(buildSystemConfigurationGraph(missing).readiness).toMatchObject({ draftReady: true, pendingBeforeDraftOpen: [] });
    const graph = buildSystemConfigurationGraph(facts);
    expect(graph.readiness).toMatchObject({ draftReady: true, pendingBeforeDraftOpen: [] });
    expect(graph.salesBom.every((line) => line.unitPrice === null && line.productSelectionStatus === "GENERIC")).toBe(true);
    const stale = { ...graph, readiness: { draftReady: false, pendingBeforeDraftOpen: ["Pricing", "Product selection"], pendingBeforeFinalIssue: ["Customer", "Pricing"] } };
    expect(constrainDocumentDraftReadiness(stale, facts).readiness).toEqual({ draftReady: true, pendingBeforeDraftOpen: [], pendingBeforeFinalIssue: ["Customer", "Pricing"] });
  });

  it.each([["توريد وتركيب", "SUPPLY_AND_INSTALLATION"], ["Supply and installation", "SUPPLY_AND_INSTALLATION"], ["توريد فقط", "SUPPLY_ONLY"], ["Supply only", "SUPPLY_ONLY"]])("resolves %s without relying on a provider scope patch or reasking", async (message, scope) => {
    const runtime = new ConversationRuntime({ decide: async () => proposal({ responseContent: "What is the scope?", blockingQuestion: "Where should the terms come from?" }) }, { execute: vi.fn() }, () => now, () => "scope-id");
    let state = await runtime.execute({ state: null, message, locale: "en", source: "TEXT", companyId: "tenant-1" });
    expect(state.confirmedFacts["scope.type"]).toMatchObject({ value: scope, provenance: "USER_EXPLICIT" });
    expect(state.messages.at(-1)!.text).not.toMatch(/What is the scope|Where should|\?/);
    expect(state.messages.at(-1)!.text).toContain("Company Settings");
    // Simulate resuming an older conversation whose explicit scope was not committed.
    delete state.confirmedFacts["scope.type"];
    state = await runtime.execute({ state, message: "Continue", locale: "en", source: "TEXT", companyId: "tenant-1" });
    expect(state.confirmedFacts["scope.type"].value).toBe(scope);
  });

  it("keeps explicit scope stronger than provider inference", async () => {
    const runtime = new ConversationRuntime({ decide: async () => proposal({ patches: [{ path: "facts.scope.type", operation: "REPLACE", value: "SUPPLY_ONLY", provenance: "AI_INFERRED", evidence: "inference" }] }) }, { execute: vi.fn() }, () => now, () => "scope-strong");
    const state = await runtime.execute({ state: null, message: "Supply and installation", locale: "en", source: "TEXT", companyId: "tenant-1" });
    expect(state.confirmedFacts["scope.type"].value).toBe("SUPPLY_AND_INSTALLATION");
    expect(renderGovernedResponse(proposal({ responseContent: "ما هو النطاق؟" }), "ar", state.workspace)).not.toContain("؟");
  });
});
