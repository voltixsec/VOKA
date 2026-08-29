import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../../ai-sales-assistant/services/AISalesAssistantService";
import { CompleteCommercialConversation } from "../../commercial-conversation/CompleteCommercialConversation";
import { AgenticSystemReasoner, generalizedSystemQuery, type CommercialSystemResearchPort, type ProvisionalSystemModel } from "..";
import { cleanCustomerEntity } from "../../ai-sales-assistant/services/customer-entity";

const fmPrompt = "Please prepare a quotation for Al Watania Contracting Company for the Kuwait City Data Center project, attention Eng. Ahmed Al-Salem, for a complete FM-200 fire suppression system for the server room according to Kuwait requirements. Payment 50% advance and 50% upon completion. Validity 30 days.";

function model(systemName: string, inputs = ["roomDimensions", "enclosureIntegrity"]): ProvisionalSystemModel {
  return {
    systemName, aliases: [], purpose: "Protect the configured space", componentCategories: ["Control", "Detection", "Suppression", "Notification"],
    inputs: inputs.map((name) => ({ name, labelAr: name === "roomDimensions" ? "أبعاد الغرفة" : "سلامة إحكام الغرفة", labelEn: name === "roomDimensions" ? "Protected room dimensions" : "Enclosure integrity", value: null, required: true, provenance: "NEEDS_CONFIRMATION" })),
    limitations: ["Final sizing requires verified engineering calculations."], confidence: 0.82, jurisdiction: "Kuwait",
    evidence: [{ title: "Manufacturer design guide", url: "https://manufacturer.example/guide", publisher: "Manufacturer", provenance: "RESEARCHED" }],
    provenance: "RESEARCHED", requiresEngineeringVerification: true,
  };
}

function fixture(research?: CommercialSystemResearchPort) {
  const customers = { findAll: vi.fn().mockImplementation(async ({ companyId, search }) => companyId === "tenant-a" && search === "Al Watania Contracting Company" ? [{ id: "c1", code: "C1", name: search, status: "ACTIVE", countryCode: "KW" }] : []) };
  const provider = { extractIntent: vi.fn().mockImplementation(async (prompt: string) => prompt.includes("New Horizon")
    ? { customerMention: "New Horizon Company", lines: [] }
    : { customerMention: "Al Watania Contracting Company for the Kuwait City Data Center project, attention Eng. Ahmed Al-Salem", projectName: "for project Kuwait City Data Center", attentionName: "attention Eng. Ahmed Al-Salem", lines: [{ text: "FM-200", quantity: 200, typeIntent: "PRODUCT" }] }) };
  const service = new AISalesAssistantService({
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) }, customers,
    catalogItems: { findAll: vi.fn().mockResolvedValue([]) }, units: { findById: vi.fn(), findBySymbol: vi.fn() },
    quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) }, pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() },
    terms: { find: vi.fn().mockResolvedValue("Delivery: subject to approved schedule\nWarranty: subject to manufacturer terms") },
  } as any, provider, research);
  return { service, customers, provider };
}

describe("bounded agentic commercial intelligence", () => {
  it("generalizes private commercial requests while retaining a material manufacturer reference", () => {
    const query = generalizedSystemQuery("Prepare a passenger elevator similar to Marafie for Al X customer at secret Project Y with price 99 KWD in Kuwait", "en");
    expect(query).toMatch(/Marafie.*passenger elevator.*Kuwait/i);
    expect(query).not.toMatch(/Al X|secret|Project Y|99|KWD|customer/i);
  });

  it("reuses research for clarification but re-researches an explicit material system correction", async () => {
    const research = { researchSystem: vi.fn().mockImplementation(async ({ query }) => model(query.includes("hydraulic goods") ? "Hydraulic goods lift" : "Passenger traction elevator", ["numberOfStops"])) };
    const reasoner = new AgenticSystemReasoner(research);
    const first = await reasoner.resolve({ companyId: "tenant-a", prompt: "Passenger elevator system in Kuwait", currentTurn: "Passenger elevator system in Kuwait", locale: "en" });
    const clarification = await reasoner.resolve({ companyId: "tenant-a", prompt: "Passenger elevator system in Kuwait", currentTurn: "12 stops", locale: "en", retained: first, answers: { numberOfStops: 12 } });
    expect(research.researchSystem).toHaveBeenCalledTimes(1);
    expect(clarification?.provisionalSystem?.inputs[0]).toMatchObject({ value: 12, provenance: "USER_PROVIDED" });
    const changed = await reasoner.resolve({ companyId: "tenant-a", prompt: "Passenger elevator system in Kuwait", currentTurn: "Actually I mean a hydraulic goods lift, not a passenger traction elevator.", locale: "en", retained: clarification, answers: { numberOfStops: 12 } });
    expect(research.researchSystem).toHaveBeenCalledTimes(2);
    expect(changed?.systemName).toBe("Hydraulic goods lift");
    expect(changed?.provisionalSystem?.inputs[0].value).toBeNull();
  });
  it("keeps known CCTV on verified deterministic profiles without research", async () => {
    const research = { researchSystem: vi.fn() };
    const { service } = fixture(research);
    const proposal = await service.generateDraftProposal({ companyId: "tenant-a", prompt: "Quotation for Al Watania Contracting Company supply and install CCTV system with 12 cameras", sourceLocale: "en" });
    expect(proposal.agenticState).toMatchObject({ route: "VERIFIED_PROFILE", profileId: "CCTV", researchStatus: "NOT_REQUIRED", requiresHumanReview: true });
    expect(research.researchSystem).not.toHaveBeenCalled();
    expect(proposal.smartSystem?.systemType).toBe("CCTV");
  });

  it("routes FM-200 through researched provisional state without treating 200 as quantity", async () => {
    const research = { researchSystem: vi.fn().mockResolvedValue(model("FM-200 fire suppression system")) };
    const { service, customers } = fixture(research);
    const conversation = new CompleteCommercialConversation(service);
    const first = await conversation.execute({ companyId: "tenant-a", reply: fmPrompt, replySource: "TEXT", locale: "en", documentMode: "QUOTATION" });
    expect(customers.findAll).toHaveBeenCalledWith(expect.objectContaining({ companyId: "tenant-a", search: "Al Watania Contracting Company" }));
    expect(first.canonicalProposal?.proposal).toMatchObject({ projectName: "Kuwait City Data Center", attentionName: "Eng. Ahmed Al-Salem" });
    expect(first.canonicalProposal?.commercialTerms?.paymentTerms).toBe("50% advance, 50% upon completion");
    expect(first.canonicalProposal?.agenticState).toMatchObject({ route: "PROVISIONAL_RESEARCH", researchStatus: "COMPLETED", missingInputs: ["roomDimensions", "enclosureIntegrity"], requiresHumanReview: true });
    expect(first.canonicalProposal?.agenticState?.provisionalSystem?.evidence[0]).toMatchObject({ provenance: "RESEARCHED", publisher: "Manufacturer" });
    expect(first.canonicalProposal?.lines.some((line) => line.quantity === 200)).toBe(false);
    expect(first.activeQuestion?.field).toBe("roomDimensions");
    expect(first.canonicalProposal?.termsAndConditions).not.toMatch(/CCTV|camera|retention/i);
    expect(first.executed).toBe(false);

    const next = await conversation.execute({ companyId: "tenant-a", reply: "6m x 5m x 3m", replySource: "VOICE", locale: "en", draft: first });
    expect(research.researchSystem).toHaveBeenCalledTimes(1);
    expect(next.canonicalProposal?.agenticState?.provisionalSystem?.inputs.find((input) => input.name === "roomDimensions")).toMatchObject({ value: "6m x 5m x 3m", provenance: "USER_PROVIDED" });
    expect(next.activeQuestion?.field).toBe("enclosureIntegrity");
    expect(next.canonicalProposal?.customer).toEqual(first.canonicalProposal?.customer);
    expect(next.canonicalProposal?.proposal).toMatchObject({ projectName: "Kuwait City Data Center", attentionName: "Eng. Ahmed Al-Salem" });
    expect(next.requiresHumanReview).toBe(true);
  });

  it("uses mocked research for an unregistered elevator and generic unknown system without fabricating quantities", async () => {
    const research = { researchSystem: vi.fn().mockImplementation(async ({ query }) => model(query.includes("elevator") ? "Electronic passenger elevator" : "Orion Flux System", ["numberOfStops"])) };
    const { service } = fixture(research);
    const elevator = await service.generateDraftProposal({ companyId: "tenant-a", prompt: "Prepare a supply and installation quotation for an electronic passenger elevator system similar to systems supplied by Marafie in Kuwait.", sourceLocale: "en" });
    expect(elevator.agenticState).toMatchObject({ route: "PROVISIONAL_RESEARCH", systemName: "Electronic passenger elevator", missingInputs: ["numberOfStops"] });
    expect(elevator.lines).toEqual([]);
    const generic = await service.generateDraftProposal({ companyId: "tenant-a", prompt: "Prepare a quotation for an Orion Flux System in Kuwait", sourceLocale: "en" });
    expect(generic.agenticState?.provisionalSystem).toMatchObject({ systemName: "Orion Flux System", provenance: "RESEARCHED", requiresEngineeringVerification: true });
    expect(research.researchSystem).toHaveBeenLastCalledWith(expect.objectContaining({ companyId: "tenant-a", locale: "en", jurisdiction: "Kuwait" }));
    expect(research.researchSystem.mock.calls.at(-1)?.[0].query).not.toMatch(/customer|project/i);
  });

  it("falls back safely when research is unavailable and keeps an unknown customer non-blocking", async () => {
    const research = { researchSystem: vi.fn().mockRejectedValue(new Error("offline")) };
    const { service } = fixture(research);
    const draft = await new CompleteCommercialConversation(service).execute({ companyId: "tenant-a", reply: "Prepare a quotation for New Horizon Company for an Aurora Safety System", replySource: "TEXT", locale: "en", documentMode: "QUOTATION" });
    expect(draft.proposedCustomerName).toBe("New Horizon Company");
    expect(draft.canonicalProposal?.agenticState).toMatchObject({ route: "PROVISIONAL_INTERPRETATION", researchStatus: "UNAVAILABLE", requiresHumanReview: true });
    expect(draft.canonicalProposal?.agenticState?.provisionalSystem?.evidence).toEqual([]);
    expect(draft.status).toBe("NEEDS_CLARIFICATION");
    expect(draft.executed).toBe(false);
    expect(cleanCustomerEntity("New Horizon Company for an Aurora Safety System")).toBe("New Horizon Company");
  });
});
