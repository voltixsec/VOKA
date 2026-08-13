// Phase 1.2: Shared pure localization analyzer extracted from localizeQuotationDraft
// This module contains the deterministic analysis logic used both by the background
// localisation job (localizeQuotationDraft) and the application use‑cases.

type Locale = "ar" | "en";

type UnknownRecord = Record<string, unknown>;

type Binding = {
  key: string;
  source: string;
  target: UnknownRecord;
  arKey: string;
  enKey: string;
  legacyKey?: string;
};

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function asText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function containsArabic(value: string): boolean {
  return /[\u0600-\u06FF]/u.test(value);
}

function detectLocale(input: UnknownRecord, explicit?: string): Locale {
  const explicitLocale = asText(input.localizationSourceLocale);
  if (explicitLocale === "ar" || explicitLocale === "en") {
    return explicitLocale;
  }
  const candidates: string[] = [];
  for (const v of [
    input.projectName,
    input.attentionName,
    input.notes,
    input.termsAndConditions,
    input.subjectAr,
    input.subjectEn,
    input.briefAr,
    input.briefEn,
  ]) {
    const txt = asText(v);
    if (txt) candidates.push(txt);
  }
  const customer = asRecord(input.customer);
  const custName = asText(customer?.name);
  if (custName) candidates.push(custName);

  if (Array.isArray(input.lines)) {
    for (const rawLine of input.lines) {
      const line = asRecord(rawLine);
      if (!line) continue;
      for (const val of [line.itemName, line.description, line.unitName]) {
        const txt = asText(val);
        if (txt) candidates.push(txt);
      }
    }
  }

  const arabicCount = candidates.filter(containsArabic).length;
  return arabicCount > 0 ? "ar" : "en";
}

function sourceText(
  object: UnknownRecord,
  sourceLocale: Locale,
  arKey: string,
  enKey: string,
  legacyKey?: string,
): string | null {
  const localized = asText(object[sourceLocale === "ar" ? arKey : enKey]);
  if (localized) return localized;
  if (legacyKey) return asText(object[legacyKey]);
  return null;
}

/**
 * Analyse a quotation snapshot (plain JS object) and collect:
 *   - the determined source locale
 *   - items that require translation (key + raw text)
 *   - bindings that describe where the translated text should be written back
 */
export function analyzeQuotationLocalization<T extends UnknownRecord>(
  input: T,
  sourceLocaleOverride?: Locale,
): {
  sourceLocale: Locale;
  items: Array<{ key: string; text: string }>;
  bindings: Binding[];
} {
  const output = structuredClone(input) as T;
  const outputRecord = output as UnknownRecord;

  const sourceLocale = sourceLocaleOverride ?? detectLocale(outputRecord);
  const targetLocale: Locale = sourceLocale === "ar" ? "en" : "ar";

  const items: Array<{ key: string; text: string }> = [];
  const bindings: Binding[] = [];

  function bind(
    target: UnknownRecord,
    key: string,
    source: string | null,
    arKey: string,
    enKey: string,
    legacyKey?: string,
  ) {
    if (!source) return;
    // Skip if opposite locale already has a value
    const existing = asText(target[sourceLocale === "ar" ? enKey : arKey]);
    if (existing) return;
    items.push({ key, text: source });
    bindings.push({ key, source, target, arKey, enKey, legacyKey });
  }

  // Customer
  const customer = asRecord(outputRecord.customer);
  if (customer) {
    const hasLocalizedCustomerName =
      asText(customer.nameAr) !== null ||
      asText(customer.nameEn) !== null;

    if (hasLocalizedCustomerName) {
      bind(
        customer,
        "customer_name",
        sourceText(customer, sourceLocale, "nameAr", "nameEn", "name"),
        "nameAr",
        "nameEn",
        "name",
      );
    }
  }

  // Header fields
  bind(
    outputRecord,
    "project_name",
    sourceText(outputRecord, sourceLocale, "projectNameAr", "projectNameEn", "projectName"),
    "projectNameAr",
    "projectNameEn",
    "projectName",
  );
  bind(
    outputRecord,
    "attention_name",
    sourceText(
      outputRecord,
      sourceLocale,
      "attentionNameAr",
      "attentionNameEn",
      "attentionName",
    ),
    "attentionNameAr",
    "attentionNameEn",
    "attentionName",
  );
  bind(
    outputRecord,
    "subject",
    sourceText(outputRecord, sourceLocale, "subjectAr", "subjectEn"),
    "subjectAr",
    "subjectEn",
  );
  bind(
    outputRecord,
    "brief",
    sourceText(outputRecord, sourceLocale, "briefAr", "briefEn"),
    "briefAr",
    "briefEn",
  );
  bind(
    outputRecord,
    "notes",
    sourceText(outputRecord, sourceLocale, "notesAr", "notesEn", "notes"),
    "notesAr",
    "notesEn",
    "notes",
  );
  bind(
    outputRecord,
    "terms",
    sourceText(
      outputRecord,
      sourceLocale,
      "termsAndConditionsAr",
      "termsAndConditionsEn",
      "termsAndConditions",
    ),
    "termsAndConditionsAr",
    "termsAndConditionsEn",
    "termsAndConditions",
  );

  // Lines
  if (Array.isArray(outputRecord.lines)) {
    outputRecord.lines.forEach((rawLine, index) => {
      const line = asRecord(rawLine);
      if (!line) return;
      bind(
        line,
        `line_${index}_item_name`,
        sourceText(line, sourceLocale, "itemNameAr", "itemNameEn", "itemName"),
        "itemNameAr",
        "itemNameEn",
        "itemName",
      );
      bind(
        line,
        `line_${index}_description`,
        sourceText(line, sourceLocale, "descriptionAr", "descriptionEn", "description"),
        "descriptionAr",
        "descriptionEn",
        "description",
      );
      bind(
        line,
        `line_${index}_unit_name`,
        sourceText(line, sourceLocale, "unitNameAr", "unitNameEn", "unitName"),
        "unitNameAr",
        "unitNameEn",
        "unitName",
      );
    });
  }

  return { sourceLocale, items, bindings };
}
