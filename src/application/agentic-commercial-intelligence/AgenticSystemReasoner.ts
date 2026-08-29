import type { SystemCalculationResult } from "../../domain/smart-system";
import type { SystemFieldAnswers } from "../ai-sales-assistant/dto/AISalesAssistantDto";
import type { CommercialSystemResearchPort } from "./ports";
import type { AgenticCommercialState, ProvisionalSystemModel } from "./types";

const systemRequest = /(?:\b(?:system|elevator|lift|fire suppression|fire fighting|fm[-\s]?200)\b|(?:نظام|سيستم|مصعد|إطفاء|حريق))/i;

function jurisdiction(prompt: string) {
  return /\bkuwait\b|الكويت/i.test(prompt) ? "Kuwait" : null;
}

/** Removes commercial identities before a query leaves the tenant boundary. */
export function generalizedSystemQuery(prompt: string, locale: "ar" | "en") {
  const named = prompt.match(/(?:for|نظام|سيستم)\s+(?:a\s+|an\s+)?([^,،.]{2,100}?(?:system|نظام|سيستم|elevator|مصعد|fm[-\s]?200))/i)?.[1];
  const known = prompt.match(/(?:fm[-\s]?200|electronic passenger elevator|passenger elevator|hydraulic goods lift|goods lift|نظام\s+[^,،.]{2,80}|سيستم\s+[^,،.]{2,80}|مصعد\s+[^,،.]{2,80})/i)?.[0];
  const system = (named ?? known ?? (locale === "ar" ? "النظام المطلوب" : "requested system")).trim();
  const reference = prompt.match(/(?:similar to|supplied by|manufacturer|brand|مشابه(?:ة)? لـ?|مورد من|من شركة)\s+([\p{L}\p{N}][\p{L}\p{N} .&-]{1,48})/iu)?.[1]
    ?.replace(/\b(?:for|at|in)\b.*$/i, "").trim();
  return `${reference ? `${reference} ` : ""}${system} technical components required design inputs${jurisdiction(prompt) ? " Kuwait" : ""}`.slice(0, 240);
}

function interpretedModel(prompt: string, locale: "ar" | "en"): ProvisionalSystemModel {
  const query = generalizedSystemQuery(prompt, locale);
  const systemName = query.replace(/ technical components required design inputs(?: Kuwait)?$/i, "");
  const isElevator = /elevator|lift|مصعد/i.test(`${prompt} ${systemName}`);
  const isFm200 = /fm[-\s]?200|إطفاء|غاز/i.test(`${prompt} ${systemName}`);
  const inputs: ProvisionalSystemModel["inputs"] = isElevator
    ? [
        { name: "elevatorQuantity", labelAr: "عدد المصاعد المطلوبة", labelEn: "Number of elevators required", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
        { name: "numberOfStops", labelAr: "عدد الطوابق أو الوقفات", labelEn: "Number of stops or floors", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
        { name: "capacity", labelAr: "الحمولة المطلوبة", labelEn: "Load capacity", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
        { name: "vehicleClass", labelAr: "نوع المركبات", labelEn: "Vehicle class", value: null, required: false, provenance: "NEEDS_CONFIRMATION" },
      ]
    : isFm200
      ? [
          { name: "protectedVolume", labelAr: "حجم الحيز المحمي", labelEn: "Protected enclosure volume", value: null, unit: "m3", required: true, provenance: "NEEDS_CONFIRMATION" },
          { name: "drawingAvailable", labelAr: "توفر مخطط وأبعاد الحيز", labelEn: "Drawing and enclosure dimensions available", value: null, required: false, provenance: "NEEDS_CONFIRMATION" },
        ]
    : [{ name: "projectConfiguration", labelAr: "متطلبات مواصفات النظام", labelEn: "System configuration requirements", value: null, required: true, provenance: "NEEDS_CONFIRMATION" }];

  return {
    systemName, aliases: [], purpose: locale === "ar" ? "نظام مطلوب يحتاج تحققاً هندسياً" : "Requested system requiring engineering verification",
    componentCategories: [],
    inputs,
    limitations: ["Research capability unavailable; no engineering quantities or compliance claims were created."],
    confidence: 0.35, jurisdiction: jurisdiction(prompt), evidence: [], provenance: "AI_INTERPRETED", requiresEngineeringVerification: true,
  };
}

function enrichSafeInputs(model: ProvisionalSystemModel): ProvisionalSystemModel {
  const names = new Set(model.inputs.map((item) => item.name));
  const inputs = [...model.inputs];
  if (/vehicle|car\s*lift|مصعد سيارات/i.test(`${model.systemName} ${model.aliases.join(" ")}`) && !names.has("vehicleClass")) {
    inputs.push({ name: "vehicleClass", labelAr: "نوع المركبات", labelEn: "Vehicle class", value: null, required: false, provenance: "NEEDS_CONFIRMATION" });
  }
  const hasSizingGeometry = [...names].some((name) => /volume|dimension|area|حجم|أبعاد/i.test(name));
  if (/fm[-\s]?200|fire suppression|إطفاء/i.test(`${model.systemName} ${model.aliases.join(" ")}`) && !hasSizingGeometry) {
    inputs.push({ name: "protectedVolume", labelAr: "حجم الحيز المحمي", labelEn: "Protected enclosure volume", value: null, unit: "m3", required: true, provenance: "NEEDS_CONFIRMATION" });
  }
  return { ...model, inputs };
}

function applyAnswers(model: ProvisionalSystemModel, answers: SystemFieldAnswers): ProvisionalSystemModel {
  return { ...model, inputs: model.inputs.map((input) => answers[input.name] == null ? input : { ...input, value: answers[input.name]!, provenance: "USER_PROVIDED" }) };
}

export class AgenticSystemReasoner {
  constructor(private readonly research?: CommercialSystemResearchPort | null) {}

  async resolve(input: { companyId: string; prompt: string; currentTurn?: string; locale: "ar" | "en"; knownSystem?: SystemCalculationResult | null; retained?: AgenticCommercialState | null; answers?: SystemFieldAnswers; researchRequired?: boolean; onResearchLatency?: (milliseconds: number) => void }): Promise<AgenticCommercialState | null> {
    if (input.knownSystem) return {
      route: "VERIFIED_PROFILE", systemName: input.locale === "ar" ? input.knownSystem.systemNameAr : input.knownSystem.systemNameEn,
      profileId: input.knownSystem.systemType, profileVersion: input.knownSystem.templateVersion, provisionalSystem: null,
      researchQuery: null, researchStatus: "NOT_REQUIRED", missingInputs: input.knownSystem.missingInputs,
      readiness: input.knownSystem.missingInputs.length ? "NEEDS_CLARIFICATION" : "VERIFIED_CALCULATION", requiresHumanReview: true,
    };
    if (!input.retained && !systemRequest.test(input.prompt)) return null;
    const correction = Boolean(input.retained && input.currentTurn && /\b(?:actually|instead|not .* but|i mean)\b|(?:في الواقع|بدلاً|أقصد|مش .* لكن)/i.test(input.currentTurn) && systemRequest.test(input.currentTurn));
    const researchPrompt = correction ? input.currentTurn! : input.prompt;
    const retained = correction ? null : input.retained;
    const query = retained?.researchQuery ?? generalizedSystemQuery(researchPrompt, input.locale);
    let model = retained?.provisionalSystem ?? null;
    let researchStatus: AgenticCommercialState["researchStatus"] = retained?.researchStatus ?? "UNAVAILABLE";
    const research = this.research;
    const shouldResearch = Boolean(research && input.researchRequired !== false && (!model || (input.researchRequired === true && model.provenance !== "RESEARCHED")));
    if (shouldResearch && research) {
      const researchStarted = performance.now();
      try {
        model = await research.researchSystem({ companyId: input.companyId, query, locale: input.locale, jurisdiction: jurisdiction(researchPrompt) });
      } catch {
        model = null;
      } finally {
        input.onResearchLatency?.(performance.now() - researchStarted);
      }
      researchStatus = model ? "COMPLETED" : "UNAVAILABLE";
    }
    model ??= interpretedModel(researchPrompt, input.locale);
    model = enrichSafeInputs(model);
    model = applyAnswers(model, correction ? {} : input.answers ?? {});
    const missingInputs = model.inputs.filter((field) => field.required && field.value == null).map((field) => field.name);
    return {
      route: model.provenance === "RESEARCHED" ? "PROVISIONAL_RESEARCH" : "PROVISIONAL_INTERPRETATION",
      systemName: model.systemName, profileId: null, profileVersion: null, provisionalSystem: model, researchQuery: query, researchStatus,
      missingInputs, readiness: missingInputs.length ? "NEEDS_CLARIFICATION" : "PROVISIONAL_REVIEW", requiresHumanReview: true,
    };
  }
}
