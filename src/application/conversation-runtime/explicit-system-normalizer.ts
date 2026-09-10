import type {
  ConfirmedFact,
  ConversationLocale,
} from "./types";
import { SmartSystemBuilderService } from "@/src/application/smart-system/services/SmartSystemBuilderService";

type SystemPattern = {
  valueAr: string;
  valueEn: string;
  pattern: RegExp;
};

const SYSTEM_PATTERNS: SystemPattern[] = [
  {
    valueAr: "\u0633\u064a\u0631\u0627\u0645\u064a\u0643 \u0623\u0631\u0636\u064a\u0627\u062a",
    valueEn: "Ceramic flooring",
    pattern: /(?:\u0633\u064a\u0631\u0627\u0645\u064a\u0643|\u0628\u0644\u0627\u0637|ceramic|floor\s*tile|tiles?)/iu,
  },
  {
    valueAr: "\u0646\u0638\u0627\u0645 \u062c\u0628\u0633 \u0628\u0648\u0631\u062f",
    valueEn: "Gypsum board system",
    pattern: /(?:\u062c\u0628\u0633\s*\u0628\u0648\u0631\u062f|\u062c\u0628\u0633\u0645\s*\u0628\u0648\u0631\u062f|gypsum|drywall)/iu,
  },
  {
    valueAr: "\u0646\u0638\u0627\u0645 \u0643\u0627\u0645\u064a\u0631\u0627\u062a \u0645\u0631\u0627\u0642\u0628\u0629",
    valueEn: "CCTV system",
    pattern: /(?:\u0643\u0627\u0645\u064a\u0631\u0627\u062a?\s*(?:\u0645\u0631\u0627\u0642\u0628\u0629)?|\u0645\u0631\u0627\u0642\u0628\u0629\s*\u0628\u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627\u062a|cctv|surveillance\s*camera|ip\s*camera)/iu,
  },
  {
    valueAr: "\u0646\u0638\u0627\u0645 \u0625\u0637\u0641\u0627\u0621 FM-200",
    valueEn: "FM-200 suppression system",
    pattern: /(?:fm\s*-?\s*200|\u0627\u0641\s*\u0627\u0645\s*200)/iu,
  },
  {
    valueAr: "مصعد سيارات",
    valueEn: "Vehicle elevator",
    pattern: /(?:vehicle\s*elevator|car\s*elevator|مصعد\s*(?:سيارات|سيارة)|رافعة\s*سيارات)/iu,
  },
];

const SMART_SYSTEM_NAMES: Record<string, { ar: string; en: string }> = {
  GYPSUM_BOARD: { ar: "نظام جبس بورد", en: "Gypsum board system" },
  CCTV: { ar: "نظام كاميرات مراقبة", en: "CCTV system" },
  ACCESS_CONTROL: { ar: "نظام التحكم في الدخول", en: "Access control system" },
};

export function detectExplicitSystemIdentity(
  message: string,
  locale: ConversationLocale,
  now: string,
  replacing = false,
): ConfirmedFact | null {
  const clean = message.normalize("NFKC").trim();
  if (!clean) return null;

  const detected = new SmartSystemBuilderService().detectSystemIntent(clean);
  const smartName = detected ? SMART_SYSTEM_NAMES[detected.systemType] : null;
  if (smartName) {
    return {
      key: "system.identity",
      value: locale === "ar" ? smartName.ar : smartName.en,
      provenance: replacing ? "USER_CORRECTION" : "USER_EXPLICIT",
      evidence: clean,
      updatedAt: now,
    };
  }

  for (const system of SYSTEM_PATTERNS) {
    const match = clean.match(system.pattern);
    if (!match?.[0]) continue;

    return {
      key: "system.identity",
      value: locale === "ar" ? system.valueAr : system.valueEn,
      provenance: replacing ? "USER_CORRECTION" : "USER_EXPLICIT",
      evidence: match[0],
      updatedAt: now,
    };
  }

  return null;
}

export function detectExplicitVehicleElevatorFacts(message: string, now: string, replacing = false): Record<string, ConfirmedFact> {
  const clean = message.normalize("NFKC").trim();
  const words: Record<string, number> = { واحد: 1, واحدة: 1, اثنان: 2, اثنين: 2, اثنتان: 2, اثنتين: 2, ثلاثة: 3, ثلاث: 3, أربعة: 4, اربع: 4, خمسة: 5, خمس: 5, ستة: 6, ست: 6, سبعة: 7, سبع: 7, ثمانية: 8, ثمان: 8, تسعة: 9, تسع: 9, عشرة: 10, عشر: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const number = (value: string) => /^\d+$/u.test(value) ? Number(value) : words[value.toLocaleLowerCase()];
  const facts: Record<string, ConfirmedFact> = {};
  const quantityMatch = clean.match(/(?:(?:مصعد\s*(?:سيارات|سيارة)|vehicle\s*elevator|car\s*elevator)\s+(?:عدد\s*)?|(?:ال)?عدد(?:\s*المصعد)?\s*(?:إلى|ل|to)?\s*)([\d٠-٩]+|واحد|واحدة|اثنان|اثنين|اثنتان|اثنتين|one|two|three|four|five|six|seven|eight|nine|ten)/iu);
  if (quantityMatch?.[1]) {
    const raw = quantityMatch[1].replace(/[٠-٩]/gu, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    const value = number(raw);
    if (Number.isFinite(value) && value > 0) facts["system.quantity"] = { key: "system.quantity", value, provenance: replacing ? "USER_CORRECTION" : "USER_EXPLICIT", evidence: quantityMatch[0], updatedAt: now };
  }
  const stopsMatch = clean.match(/(?:(?:ل|for|with|up\s*to)?\s*([\d٠-٩]+|واحد|واحدة|اثنان|اثنين|ثلاثة|ثلاث|أربعة|اربعة|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثمان|تسعة|تسع|عشرة|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:طوابق|طابق|أدوار|دور|وقفات|وقفة|floors?|stops?)|(?:(?:عدد\s*)?(?:الوقفات|الطوابق|الأدوار)|stops?|floors?)\s*(?:إلى|ل|to)?\s*([\d٠-٩]+|واحد|واحدة|اثنان|اثنين|ثلاثة|ثلاث|أربعة|اربعة|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثمان|تسعة|تسع|عشرة|one|two|three|four|five|six|seven|eight|nine|ten))/iu);
  const stopsToken = stopsMatch?.[1] ?? stopsMatch?.[2];
  if (stopsToken) {
    const raw = stopsToken.replace(/[٠-٩]/gu, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    const value = number(raw);
    if (Number.isFinite(value) && value > 0) facts["system.numberOfStops"] = { key: "system.numberOfStops", value, provenance: replacing ? "USER_CORRECTION" : "USER_EXPLICIT", evidence: stopsMatch?.[0] ?? stopsToken, updatedAt: now };
  }
  return facts;
}

export function detectExplicitScopeType(message: string, now: string): ConfirmedFact | null {
  const clean = message.normalize("NFKC").trim();
  const patterns: Array<[string, RegExp]> = [
    ["SUPPLY_AND_INSTALLATION", /(?:توريد\s*و\s*تركيب|توريد وتركيب|supply\s*(?:and|&)\s*install(?:ation)?)/iu],
    ["SUPPLY_ONLY", /(?:توريد\s*فقط|supply\s*only)/iu],
    ["INSTALLATION_ONLY", /(?:تركيب\s*فقط|installation\s*only)/iu],
  ];
  for (const [value, pattern] of patterns) {
    const match = clean.match(pattern);
    if (!match?.[0]) continue;
    return { key: "scope.type", value, provenance: "USER_EXPLICIT", evidence: match[0], updatedAt: now };
  }
  return null;
}
