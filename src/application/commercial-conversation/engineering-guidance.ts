import type { SystemInputGuidance } from "../../domain/smart-system/types";
import type { FieldQuestion, WorkingCommercialDraft } from "./types";
import { fieldTarget } from "./field-completion";

type GuidanceOption = SystemInputGuidance["options"][number];

export type GuidedSystemInput = {
  name: string;
  labelAr: string;
  labelEn: string;
  value: string | number | boolean | null;
  guidance: SystemInputGuidance;
  prerequisiteFor?: string;
};

export type PrerequisiteSystemInput = {
  name: string;
  labelAr: string;
  labelEn: string;
  value: string | number | boolean | null;
  prerequisiteFor: string;
  prerequisiteReasonAr?: string;
  prerequisiteReasonEn?: string;
};

export type GuidanceSelection =
  | { status: "NONE" }
  | { status: "INVALID"; input: GuidedSystemInput }
  | { status: "SELECTED"; input: GuidedSystemInput; option: GuidanceOption };

const arabicMarks = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const fillerWords = new Set([
  "نظام", "الخيار", "خيار", "الاختيار", "اختيار", "رقم", "خليه", "خلي", "اختار", "اختر", "اعتمد", "ده", "دا", "هذا", "هو",
  "option", "choice", "select", "choose", "use", "pick", "the", "one", "go", "with", "make", "it",
]);

function normalize(text: string) {
  return text
    .normalize("NFKC")
    .replace(arabicMarks, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function meaningful(text: string) {
  return normalize(text).split(/\s+/)
    .filter((word) => word && !fillerWords.has(word))
    .map((word) => word.startsWith("ال") && word.length > 3 ? word.slice(2) : word)
    .join(" ");
}

function includesPhrase(text: string, phrase: string) {
  if (!phrase) return false;
  return (" " + text + " ").includes(" " + phrase + " ");
}

function sameValue(left: unknown, right: unknown) {
  return typeof left === typeof right && left === right;
}

function guidedInputs(draft: WorkingCommercialDraft | null | undefined): GuidedSystemInput[] {
  if (!draft) return [];
  const inputs = [
    ...(draft.canonicalProposal?.smartSystem?.inputs ?? []),
    ...(draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs ?? []),
  ];
  const seen = new Set<string>();
  return inputs.filter((input): input is typeof input & { guidance: SystemInputGuidance } => {
    if (seen.has(input.name) || !input.guidance?.options.length) return false;
    seen.add(input.name);
    return true;
  });
}

function optionMatches(option: GuidanceOption, text: string) {
  const raw = normalize(text);
  const focused = meaningful(text);
  const candidates = [option.labelAr, option.labelEn, String(option.value)]
    .flatMap((candidate) => [normalize(candidate), meaningful(candidate)])
    .filter(Boolean);
  return candidates.some((candidate) => includesPhrase(raw, candidate) || includesPhrase(focused, candidate));
}

function explicitlySelectedOption(input: GuidedSystemInput, text: string) {
  const preferredText = text.split(/\b(?:instead\s+of|rather\s+than)\b|بدل(?:اً|ا)?(?:\s+من)?/iu)[0] ?? text;
  const matches = input.guidance.options.filter((option) => optionMatches(option, preferredText));
  return matches.length === 1 ? matches[0] : null;
}

function ordinal(text: string) {
  const normalized = normalize(text);
  const wordOrdinals: Array<[RegExp, number]> = [
    [/(?:^| )(?:الاول|اول|first)(?: |$)/i, 1],
    [/(?:^| )(?:الثاني|التاني|ثاني|تاني|second)(?: |$)/i, 2],
    [/(?:^| )(?:الثالث|التالت|ثالث|تالت|third)(?: |$)/i, 3],
    [/(?:^| )(?:الرابع|رابع|fourth)(?: |$)/i, 4],
  ];
  for (const [pattern, value] of wordOrdinals) if (pattern.test(normalized)) return value;
  const numbered = normalized.match(/(?:^|(?:option|choice|الخيار|خيار|اختيار|اختار|اختر|رقم)\s+)(\d+)(?:\s|$)/i);
  return numbered ? Number(numbered[1]) : null;
}

function confirmsRecommendation(text: string) {
  return /^(?:موافق|نعم|ايو[ه]?|أيو[ه]?|تمام(?:\s+(?:اختار|اعتمد|خلي|خليه)\s*(?:ده|دا|هذا))?|امش[يى]\s+على\s+(?:ترشيحك|اختيارك)|اعتمد\s+(?:الاختيار|الخيار|ترشيحك)(?:\s+(?:ده|دا|هذا))?|yes|okay|ok|go\s+with\s+(?:that|your\s+recommendation)|use\s+your\s+recommendation|accept\s+(?:that|your\s+recommendation))[.!؟\s]*$/iu.test(text.trim());
}

const uncertaintyPattern = /(?:^| )(?:مش (?:عارف|فاهم)|ما اعرف|لا اعلم|i (?:do not|don t) know|not sure|i can t (?:answer|provide))(?: |$)/iu;
const alternatePrerequisitePattern = /(?:^| )(?:what else can you use(?: to decide)?|ask (?:me )?something else|اسال(?:ني)? (?:حاجه|شيء) تاني|خلينا في (?:حاجه|شيء) تاني)(?: |$)/iu;

export function isUnanswerableResponse(text: string) {
  const normalized = normalize(text);
  return uncertaintyPattern.test(normalized) || alternatePrerequisitePattern.test(normalized);
}

export function isGuidanceRequest(text: string) {
  if (confirmsRecommendation(text)) return false;
  const normalized = normalize(text);
  const advice = /(?:^| )(?:شوف (?:انت|انتم)|اختار ?لي|رشح ?لي|اديني (?:اختيارات|خيارات)|اعطيني (?:اختيارات|خيارات)|recommend|choose for me|give me (?:options|choices))(?: |$)/iu;
  const comparativeQuestion = /(?:^| )(?:ايه|ما|وش|what).*?(?:الافضل|الانسب|المناسب|best|suitable)(?: |$)/iu;
  const optionsQuestion = /(?:^| )(?:ايه|ما|وش|what).*?(?:الحمولات|السعات|الاختيارات|الخيارات|capacities|loads|options|choices)(?: |$)/iu;
  return isUnanswerableResponse(text) || advice.test(normalized) || comparativeQuestion.test(normalized) || optionsQuestion.test(normalized);
}

export function attemptedPrerequisiteFields(draft: WorkingCommercialDraft | null | undefined, currentIsUnanswerable: boolean) {
  const attempted = new Set(draft?.temporarilyUnanswerable ?? []);
  if (currentIsUnanswerable && draft?.activeQuestion?.guidanceFor) attempted.add(draft.activeQuestion.field);
  return attempted;
}

export function relevantGuidanceInput(draft: WorkingCommercialDraft | null | undefined) {
  const inputs = guidedInputs(draft);
  const active = inputs.find((input) => input.name === draft?.activeQuestion?.field && input.value == null);
  return active ?? inputs.find((input) => input.value == null) ?? null;
}

export function relevantPrerequisiteInput(
  draft: WorkingCommercialDraft | null | undefined,
  targetField: string | null | undefined,
  excludedFields: ReadonlySet<string> = new Set(),
): PrerequisiteSystemInput | null {
  if (!draft || !targetField) return null;
  const inputs = [
    ...(draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs ?? []),
  ];
  return inputs.find((input): input is typeof input & { prerequisiteFor: string } =>
    input.value == null && input.prerequisiteFor === targetField && !excludedFields.has(input.name)
  ) ?? null;
}

/** Resolves only bounded guidance values. Recommendation/ordinal references require an active guided question. */
export function resolveGuidanceSelection(
  draft: WorkingCommercialDraft | null | undefined,
  text: string,
  targetField?: string,
): GuidanceSelection {
  const inputs = guidedInputs(draft);
  if (!inputs.length) return { status: "NONE" };
  const active = inputs.find((input) => input.name === (targetField ?? draft?.activeQuestion?.field));
  const explicitMatches = inputs.flatMap((input) => {
    const option = explicitlySelectedOption(input, text);
    return option ? [{ input, option }] : [];
  });

  if (active) {
    const explicit = explicitlySelectedOption(active, text);
    if (explicit) return { status: "SELECTED", input: active, option: explicit };

    const position = ordinal(text);
    if (position != null) {
      const option = active.guidance.options[position - 1];
      return option ? { status: "SELECTED", input: active, option } : { status: "INVALID", input: active };
    }

    if (confirmsRecommendation(text)) {
      const option = active.guidance.options.find((candidate) => sameValue(candidate.value, active.guidance.recommendedValue));
      return option ? { status: "SELECTED", input: active, option } : { status: "INVALID", input: active };
    }

    if (explicitMatches.length === 1) return { status: "SELECTED", ...explicitMatches[0] };

    // Once a bounded guidance question is active (or explicitly targeted by a chip),
    // arbitrary text cannot bypass its option set.
    return { status: "INVALID", input: active };
  }

  if (explicitMatches.length === 1) return { status: "SELECTED", ...explicitMatches[0] };
  if (explicitMatches.length > 1) {
    return { status: "INVALID", input: inputs.find((input) => input.value == null) ?? inputs[0] };
  }
  return { status: "NONE" };
}

export function guidanceQuestion(input: GuidedSystemInput, invalid = false, guidanceFor = input.prerequisiteFor): FieldQuestion {
  return {
    field: input.name,
    guidanceFor,
    ar: invalid
      ? "الاختيار المطلوب غير متاح. اختر أحد الخيارات المحددة لـ" + input.labelAr + "."
      : "أي خيار تريد اعتماده لـ" + input.labelAr + "؟",
    en: invalid
      ? "That choice is unavailable. Select one of the bounded options for " + input.labelEn + "."
      : "Which option should be confirmed for " + input.labelEn + "?",
    allowNotApplicable: false,
    allowDefer: false,
    options: input.guidance.options.map((option) => ({
      ar: option.labelAr,
      en: option.labelEn,
      value: String(option.value),
    })),
  };
}

export function prerequisiteQuestion(input: PrerequisiteSystemInput): FieldQuestion {
  const askAr = `ما ${input.labelAr}؟`;
  const askEn = `What is the ${input.labelEn}?`;
  return {
    field: input.name,
    guidanceFor: input.prerequisiteFor,
    ar: `${input.prerequisiteReasonAr ? `${input.prerequisiteReasonAr} ` : ""}${askAr}`,
    en: `${input.prerequisiteReasonEn ? `${input.prerequisiteReasonEn} ` : ""}${askEn}`,
    allowNotApplicable: false,
    allowDefer: false,
  };
}

export function questionForEngineeringField(draft: WorkingCommercialDraft, field: string): FieldQuestion | null {
  const missing = draft.missingRequired.find((candidate) => fieldTarget(candidate) === field);
  if (missing) {
    const explicit: Record<string, [string, string]> = {
      elevatorQuantity: ["كم عدد المصاعد المطلوبة؟", "How many elevators are required?"],
      numberOfElevators: ["كم عدد المصاعد المطلوبة؟", "How many elevators are required?"],
      numberOfStops: ["كم عدد الطوابق أو الوقفات التي سيخدمها المصعد؟", "How many floors or stops will the elevator serve?"],
      floors: ["كم عدد الطوابق التي سيخدمها المصعد؟", "How many floors will the elevator serve?"],
      capacity: ["ما الحمولة المطلوبة للمصعد؟", "What elevator capacity is required?"],
      loadCapacity: ["ما الحمولة المطلوبة للمصعد؟", "What elevator capacity is required?"],
    };
    const [ar, en] = explicit[missing.sourceField ?? ""]
      ?? [`يرجى تحديد: ${missing.labelAr}.`, `Please provide: ${missing.labelEn}.`];
    return {
      field, ar, en, allowNotApplicable: false, allowDefer: false,
      options: missing.sourceField === "accessDirection" ? [
        { ar: "دخول فقط", en: "Entry only", value: "ENTRY_ONLY" },
        { ar: "دخول وخروج", en: "Entry and exit", value: "ENTRY_EXIT" },
      ] : undefined,
    };
  }
  const inputs = [
    ...(draft.canonicalProposal?.smartSystem?.inputs ?? []),
    ...(draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs ?? []),
  ];
  const input = inputs.find((candidate) => candidate.name === field && candidate.value == null);
  if (!input) return null;
  if ("guidance" in input && input.guidance?.options.length) return guidanceQuestion(input as GuidedSystemInput, false, "prerequisiteFor" in input ? input.prerequisiteFor : undefined);
  if ("prerequisiteFor" in input && typeof input.prerequisiteFor === "string") return prerequisiteQuestion(input as PrerequisiteSystemInput);
  return {
    field: input.name,
    ar: `ما ${input.labelAr}؟`, en: `What is the ${input.labelEn}?`,
    allowNotApplicable: false, allowDefer: false,
  };
}
