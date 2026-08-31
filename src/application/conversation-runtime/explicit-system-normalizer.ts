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
