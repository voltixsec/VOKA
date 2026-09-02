import { ConversationRuntime } from "../../ConversationRuntime";
import type { CandidateProduct, ConversationRuntimeState, FlexibleTurnProposal, SolutionBomLine, WorkspacePatch } from "../../types";
import type { ConversationToolPort } from "../../ports";

export const now = "2026-09-02T12:00:00.000Z";
export const marketPrice = { priceAmount: 39, priceCurrency: "KWD", priceMin: null, priceMax: null, priceUnit: "unit", priceType: "LISTED_RETAIL" as const, priceSourceUrl: "https://supplier.example/4mp", priceSourceTitle: "Fixture Kuwait listing", priceObservedAt: now };
export const candidates: CandidateProduct[] = [
  { id: "bullet", componentKey: "CCTV_BULLET_CAMERA", name: "Hikvision 4MP Bullet", nameAr: null, nameEn: "Hikvision 4MP Bullet Camera", brand: "Hikvision", model: "DS-2CD2T47", sku: null, price: null, source: "RESEARCHED", marketPrice },
  { id: "dome", componentKey: "CCTV_DOME_CAMERA", name: "Hikvision 4MP Dome", nameAr: null, nameEn: "Hikvision 4MP Dome Camera", brand: "Hikvision", model: "DS-2CD2147", sku: null, price: null, source: "RESEARCHED", marketPrice },
  { id: "nvr", componentKey: "NVR_RECORDER", name: "Hikvision DS-9664NI-I16", nameAr: null, nameEn: "Hikvision DS-9664NI-I16 NVR", brand: "Hikvision", model: "DS-9664NI-I16", sku: null, price: null, source: "RESEARCHED", capabilities: { channels: 64, diskBays: 8, maxHddCapacityTb: 18, incomingBandwidthMbps: 512, supportedCodec: "H.265" } },
  { id: "wd8", componentKey: "SURVEILLANCE_HDD", name: "WD Purple 8TB", nameAr: null, nameEn: "WD Purple 8TB", brand: "Western Digital", model: "Purple 8TB", sku: null, price: null, source: "RESEARCHED" },
];
export function proposal(overrides: Partial<FlexibleTurnProposal> = {}): FlexibleTurnProposal {
  return { responseMode: "ACK", intent: "UPDATE_SOLUTION", patches: [], researchRequests: [], recommendations: [], assumptions: [], blockingQuestion: null, responseContent: "Updated.", unresolvedImportantQuestions: [], solutionReadiness: "MATURE", transition: "NONE", compactMemory: "340 camera CCTV", suggestedReplies: [], ...overrides };
}

/** Offline provider proposals and research observations; the actual Strict Brain and runtime run unchanged. */
export async function cctv340Scenario() {
  let sequence = 0;
  let state: ConversationRuntimeState | null = null;
  const toolsCalled: string[] = [];
  const tools: ConversationToolPort = { execute: async ({ request }) => {
    toolsCalled.push(request.purpose ?? request.kind);
    return request.purpose === "JURISDICTION_RULE"
      ? { kind: request.kind, purpose: request.purpose, status: "UNAVAILABLE", summary: "No verified authority evidence in this offline fixture.", evidence: [], createdAt: now }
      : { kind: request.kind, status: "COMPLETED", summary: "Fixture product alternatives", candidateProducts: candidates, catalogResolution: "RESEARCHED_SUGGESTIONS", evidence: [], createdAt: now };
  } };
  const turn = async (message: string, decision = proposal()) => {
    state = await new ConversationRuntime({ decide: async () => decision }, tools, () => now, () => `cctv-${++sequence}`).execute({ state, message, locale: "en", source: "TEXT", companyId: "tenant-1" });
    return state;
  };
  const initialMessage = "CCTV 340 cameras 4MP IP in Kuwait supply and installation for Kuwait Customer, attention Eng. Ahmad";
  const values = { "system.identity": "CCTV", "system.cameraCount": 340, "system.resolutionMp": 4, "system.jurisdiction": "Kuwait", "scope.type": "SUPPLY_AND_INSTALLATION", "customer.name": "Kuwait Customer", "attention.name": "Eng. Ahmad" };
  const initial = await turn(initialMessage, proposal({ patches: Object.entries(values).map(([key, value]) => ({ operation: "SET", path: `facts.${key}`, value, evidence: initialMessage, provenance: "USER_EXPLICIT" })) }));
  const parent = initial.workspace!.engineering.bom.find((line) => line.id === "CCTV_CAMERAS")!;
  const child = (id: string, subtype: string): SolutionBomLine => ({ ...parent, id, componentKeys: [id], quantity: 170, itemName: `${subtype} IP camera`, itemNameEn: `${subtype} IP camera`, itemNameAr: `كاميرا ${subtype}`, description: null, commercialAttributes: undefined });
  const split = await turn("170 Bullet and 170 Dome", proposal({ patches: [{ operation: "REPLACE", path: "engineering.bom.CCTV_CAMERAS", value: [child("CCTV_BULLET_CAMERA", "Bullet"), child("CCTV_DOME_CAMERA", "Dome")], evidence: "170 Bullet and 170 Dome", provenance: "USER_EXPLICIT" }] }));
  await turn("Get product alternatives", proposal({ researchRequests: [{ kind: "CATALOG_LOOKUP", query: "Product alternatives", attachmentId: null }] }));
  const bulletApproved = await turn("Approve Hikvision DS-2CD2T47");
  // A semantic approval patch must use the same selection reducer as a named approval.
  const domeApproved = await turn("Yes, use that dome", proposal({ patches: [{ operation: "APPROVE", path: "products.candidates.dome", value: "dome", evidence: "Yes, use that dome", provenance: "USER_EXPLICIT" }] }));
  const nvrApproved = await turn("Approve Hikvision DS-9664NI-I16");
  const confirm = "Confirm 6 NVRs with 16 HDD bays each";
  const patches: WorkspacePatch[] = [
    { operation: "REPLACE", path: "facts.product.selection.NVR_RECORDER.capabilities.diskBays", value: 16, evidence: confirm, provenance: "USER_CORRECTION" },
    { operation: "SET", path: "facts.system.recorderCount", value: 6, evidence: confirm, provenance: "USER_EXPLICIT" },
  ];
  const confirmed = await turn(confirm, proposal({ patches }));
  const rejected = await turn("Approve WD Purple 8TB");
  const final = await turn("Continue", proposal({ suggestedReplies: ["Reduce retention to 7 days", "Review installation"] }));
  return { initial, split, bulletApproved, domeApproved, nvrApproved, confirmed, rejected, final, turn, toolsCalled };
}
