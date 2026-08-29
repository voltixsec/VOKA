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
  const known = prompt.match(/(?:fm[-\s]?200|electronic passenger elevator|passenger elevator|نظام\s+[^,،.]{2,80}|سيستم\s+[^,،.]{2,80})/i)?.[0];
  const system = (named ?? known ?? (locale === "ar" ? "النظام المطلوب" : "requested system")).trim();
  return `${system} technical components required design inputs${jurisdiction(prompt) ? " Kuwait" : ""}`.slice(0, 240);
}

function interpretedModel(prompt: string, locale: "ar" | "en"): ProvisionalSystemModel {
  const query = generalizedSystemQuery(prompt, locale);
  const systemName = query.replace(/ technical components required design inputs(?: Kuwait)?$/i, "");
  return {
    systemName, aliases: [], purpose: locale === "ar" ? "نظام مطلوب يحتاج تحققاً هندسياً" : "Requested system requiring engineering verification",
    componentCategories: [],
    inputs: [{ name: "projectConfiguration", labelAr: "بيانات التكوين الأساسية للمشروع", labelEn: "Basic project configuration", value: null, required: true, provenance: "NEEDS_CONFIRMATION" }],
    limitations: ["Research capability unavailable; no engineering quantities or compliance claims were created."],
    confidence: 0.35, jurisdiction: jurisdiction(prompt), evidence: [], provenance: "AI_INTERPRETED", requiresEngineeringVerification: true,
  };
}

function applyAnswers(model: ProvisionalSystemModel, answers: SystemFieldAnswers): ProvisionalSystemModel {
  return { ...model, inputs: model.inputs.map((input) => answers[input.name] == null ? input : { ...input, value: answers[input.name]!, provenance: "USER_PROVIDED" }) };
}

export class AgenticSystemReasoner {
  constructor(private readonly research?: CommercialSystemResearchPort | null) {}

  async resolve(input: { companyId: string; prompt: string; locale: "ar" | "en"; knownSystem?: SystemCalculationResult | null; retained?: AgenticCommercialState | null; answers?: SystemFieldAnswers }): Promise<AgenticCommercialState | null> {
    if (input.knownSystem) return {
      route: "VERIFIED_PROFILE", systemName: input.locale === "ar" ? input.knownSystem.systemNameAr : input.knownSystem.systemNameEn,
      profileId: input.knownSystem.systemType, profileVersion: input.knownSystem.templateVersion, provisionalSystem: null,
      researchQuery: null, researchStatus: "NOT_REQUIRED", missingInputs: input.knownSystem.missingInputs,
      readiness: input.knownSystem.missingInputs.length ? "NEEDS_CLARIFICATION" : "VERIFIED_CALCULATION", requiresHumanReview: true,
    };
    if (!input.retained && !systemRequest.test(input.prompt)) return null;
    const query = input.retained?.researchQuery ?? generalizedSystemQuery(input.prompt, input.locale);
    let model = input.retained?.provisionalSystem ?? null;
    let researchStatus: AgenticCommercialState["researchStatus"] = input.retained?.researchStatus ?? "UNAVAILABLE";
    if (!model && this.research) {
      try {
        model = await this.research.researchSystem({ companyId: input.companyId, query, locale: input.locale, jurisdiction: jurisdiction(input.prompt) });
      } catch {
        model = null;
      }
      researchStatus = model ? "COMPLETED" : "UNAVAILABLE";
    }
    model ??= interpretedModel(input.prompt, input.locale);
    model = applyAnswers(model, input.answers ?? {});
    const missingInputs = model.inputs.filter((field) => field.required && field.value == null).map((field) => field.name);
    return {
      route: model.provenance === "RESEARCHED" ? "PROVISIONAL_RESEARCH" : "PROVISIONAL_INTERPRETATION",
      systemName: model.systemName, profileId: null, profileVersion: null, provisionalSystem: model, researchQuery: query, researchStatus,
      missingInputs, readiness: missingInputs.length ? "NEEDS_CLARIFICATION" : "PROVISIONAL_REVIEW", requiresHumanReview: true,
    };
  }
}
