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

const vehicleClassGuidance = {
  options: [
    { value: "PASSENGER_CAR", labelAr: "سيارات ركوب عادية", labelEn: "Passenger cars", explanationAr: "للسيارات العادية فقط.", explanationEn: "For standard passenger cars only." },
    { value: "SUV", labelAr: "سيارات SUV", labelEn: "SUVs", explanationAr: "عند الحاجة لاستيعاب سيارات أكبر.", explanationEn: "When larger passenger vehicles must be accommodated." },
    { value: "HEAVIER_VEHICLE", labelAr: "مركبات أثقل", labelEn: "Heavier vehicles", explanationAr: "يحتاج تحديد نوع المركبة وأبعادها قبل أي اختيار للحمولة.", explanationEn: "Requires the vehicle type and dimensions before any load selection." },
  ],
  recommendedValue: null,
  rationaleAr: "نوع المركبة سؤال تمهيدي آمن يساعدنا نوجّه اختيار الحمولة لاحقًا من غير ما نفترض قيمة هندسية.",
  rationaleEn: "Vehicle class is a safe prerequisite that guides later load selection without assuming an engineering value.",
  requiresConfirmation: true,
  provenance: "SUGGESTED" as const,
};

function enrichSafeInputs(model: ProvisionalSystemModel): ProvisionalSystemModel {
  const names = new Set(model.inputs.map((item) => item.name));
  const vehicleElevator = /vehicle|car\s*lift|مصعد سيارات/i.test(`${model.systemName} ${model.aliases.join(" ")}`);
  const inputs = model.inputs.map((input) => vehicleElevator && input.name === "vehicleClass"
    ? {
        ...input,
        guidance: input.guidance ?? vehicleClassGuidance,
        prerequisiteFor: "capacity",
        prerequisiteReasonAr: "نوع المركبة يضيّق نطاق قرار الحمولة، لكنه لا يحدد حمولة نهائية بمفرده.",
        prerequisiteReasonEn: "Vehicle class narrows the load decision, but it cannot establish a final rated load by itself.",
      }
    : input);
  if (vehicleElevator && !names.has("vehicleClass")) {
    inputs.push({
      name: "vehicleClass", labelAr: "نوع المركبات", labelEn: "Vehicle class", value: null, required: false, provenance: "NEEDS_CONFIRMATION",
      guidance: vehicleClassGuidance,
      prerequisiteFor: "capacity",
      prerequisiteReasonAr: "نوع المركبة يضيّق نطاق قرار الحمولة، لكنه لا يحدد حمولة نهائية بمفرده.",
      prerequisiteReasonEn: "Vehicle class narrows the load decision, but it cannot establish a final rated load by itself.",
    });
  }
  if (vehicleElevator && !names.has("maximumVehicleWeight")) {
    inputs.push({
      name: "maximumVehicleWeight", labelAr: "أقصى وزن متوقع للمركبة", labelEn: "Expected maximum vehicle weight", unit: "kg",
      value: null, required: false, provenance: "NEEDS_CONFIRMATION", prerequisiteFor: "capacity",
      prerequisiteReasonAr: "اختيار فئة SUV ضيّق لنا النطاق، لكن نوع السيارة وحده مش كفاية لاعتماد حمولة نهائية. محتاجين أقصى وزن تقريبي للمركبة أو أبعاد المنصة/البئر أو المخطط.",
      prerequisiteReasonEn: "SUV use narrows the range, but vehicle class alone is insufficient to establish a final rated load. We need the approximate maximum vehicle weight, platform or shaft dimensions, or the drawing.",
    });
  }
  if (vehicleElevator && !names.has("expectedVehicleModel")) {
    inputs.push({
      name: "expectedVehicleModel", labelAr: "أكبر نوع أو موديل مركبة متوقع", labelEn: "Heaviest expected vehicle type or model",
      value: null, required: false, provenance: "NEEDS_CONFIRMATION", prerequisiteFor: "capacity",
      prerequisiteReasonAr: "بما إن الوزن مش متوفر، نقدر نضيّق القرار من نوع أو موديل أكبر مركبة متوقع تستخدم المصعد من غير ما نفترض وزنها.",
      prerequisiteReasonEn: "Since the weight is unavailable, we can narrow the decision using the heaviest expected vehicle type or model without inventing its weight.",
    });
  }
  if (vehicleElevator && !names.has("drawingAvailable")) {
    inputs.push({
      name: "drawingAvailable", labelAr: "توفر مخطط للمصعد أو البئر", labelEn: "Availability of an elevator or shaft drawing",
      value: null, required: false, provenance: "NEEDS_CONFIRMATION", prerequisiteFor: "capacity",
      prerequisiteReasonAr: "لو نوع المركبة أو وزنها غير معروفين، المخطط يوفّر مدخلًا أوثق لاستكمال الترشيح من غير افتراضات.",
      prerequisiteReasonEn: "If the vehicle type and weight are unknown, a drawing provides a more reliable input without unsafe assumptions.",
    });
  }
  if (vehicleElevator && !names.has("shaftDimensions")) {
    inputs.push({
      name: "shaftDimensions", labelAr: "أبعاد بئر المصعد التقريبية", labelEn: "Approximate shaft dimensions",
      value: null, required: false, provenance: "NEEDS_CONFIRMATION", prerequisiteFor: "capacity",
      prerequisiteReasonAr: "لو المخطط غير متوفر، أبعاد البئر التقريبية تساعد في تضييق التكوين، لكنها لن تعتمد الحمولة وحدها.",
      prerequisiteReasonEn: "If no drawing is available, approximate shaft dimensions can narrow the configuration but cannot establish rated load alone.",
    });
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

  async resolve(input: { companyId: string; prompt: string; currentTurn?: string; locale: "ar" | "en"; knownSystem?: SystemCalculationResult | null; retained?: AgenticCommercialState | null; answers?: SystemFieldAnswers; researchRequired?: boolean; onResearchLatency?: (milliseconds: number) => void; onProviderCall?: (kind: "RESEARCH") => void }): Promise<AgenticCommercialState | null> {
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
        model = await research.researchSystem({ companyId: input.companyId, query, locale: input.locale, jurisdiction: jurisdiction(researchPrompt), onProviderCall: () => input.onProviderCall?.("RESEARCH") });
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
