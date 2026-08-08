import {
  createTranslationPort,
} from "../createTranslationPort";

type Locale =
  | "ar"
  | "en";

type UnknownRecord =
  Record<string, unknown>;

type Binding = {
  key: string;
  source: string;
  target: UnknownRecord;
  arKey: string;
  enKey: string;
  legacyKey?: string;
};

function asRecord(
  value: unknown,
): UnknownRecord | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as UnknownRecord;
}

function asText(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

function containsArabic(
  value: string,
): boolean {
  return /[\u0600-\u06FF]/u.test(
    value,
  );
}

function detectLocale(
  input: UnknownRecord,
): Locale {
  const explicit =
    asText(
      input.localizationSourceLocale,
    );

  if (
    explicit === "ar" ||
    explicit === "en"
  ) {
    return explicit;
  }

  const candidates: string[] = [];

  for (
    const value of [
      input.projectName,
      input.attentionName,
      input.notes,
      input.termsAndConditions,
      input.subjectAr,
      input.subjectEn,
      input.briefAr,
      input.briefEn,
    ]
  ) {
    const text =
      asText(value);

    if (text) {
      candidates.push(text);
    }
  }

  const customer =
    asRecord(input.customer);

  const customerName =
    asText(customer?.name);

  if (customerName) {
    candidates.push(
      customerName,
    );
  }

  if (Array.isArray(input.lines)) {
    for (const rawLine of input.lines) {
      const line =
        asRecord(rawLine);

      if (!line) {
        continue;
      }

      for (
        const value of [
          line.itemName,
          line.description,
          line.unitName,
        ]
      ) {
        const text =
          asText(value);

        if (text) {
          candidates.push(text);
        }
      }
    }
  }

  const arabic =
    candidates.filter(
      containsArabic,
    ).length;

  return arabic > 0
    ? "ar"
    : "en";
}

function sourceText(
  object: UnknownRecord,
  sourceLocale: Locale,
  arKey: string,
  enKey: string,
  legacyKey?: string,
): string | null {
  const localized =
    asText(
      object[
        sourceLocale === "ar"
          ? arKey
          : enKey
      ],
    );

  if (localized) {
    return localized;
  }

  if (legacyKey) {
    return asText(
      object[legacyKey],
    );
  }

  return null;
}

function setLocalizedPair(
  target: UnknownRecord,
  sourceLocale: Locale,
  arKey: string,
  enKey: string,
  source: string,
  translated: string,
): void {
  if (sourceLocale === "ar") {
    target[arKey] =
      source;

    target[enKey] =
      translated;

    return;
  }

  target[enKey] =
    source;

  target[arKey] =
    translated;
}

export async function localizeQuotationDraft<
  T extends UnknownRecord,
>(
  input: T,
): Promise<T> {
  const port =
    createTranslationPort();

  if (!port) {
    return input;
  }

  const output =
    structuredClone(
      input,
    ) as T;

  const outputRecord =
    output as UnknownRecord;

  const sourceLocale =
    detectLocale(
      outputRecord,
    );

  const targetLocale: Locale =
    sourceLocale === "ar"
      ? "en"
      : "ar";

  const items: Array<{
    key: string;
    text: string;
  }> = [];

  const bindings: Binding[] =
    [];

  function bind(
    target: UnknownRecord,
    key: string,
    source: string | null,
    arKey: string,
    enKey: string,
    legacyKey?: string,
  ): void {
    if (!source) {
      return;
    }

    items.push({
      key,
      text: source,
    });

    bindings.push({
      key,
      source,
      target,
      arKey,
      enKey,
      legacyKey,
    });
  }

  /* ========================================
     CUSTOMER
  ======================================== */

  const customer =
    asRecord(
      outputRecord.customer,
    );

  if (customer) {
    bind(
      customer,
      "customer_name",
      sourceText(
        customer,
        sourceLocale,
        "nameAr",
        "nameEn",
        "name",
      ),
      "nameAr",
      "nameEn",
      "name",
    );
  }

  /* ========================================
     QUOTATION HEADER
  ======================================== */

  bind(
    outputRecord,
    "project_name",
    sourceText(
      outputRecord,
      sourceLocale,
      "projectNameAr",
      "projectNameEn",
      "projectName",
    ),
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
    sourceText(
      outputRecord,
      sourceLocale,
      "subjectAr",
      "subjectEn",
    ),
    "subjectAr",
    "subjectEn",
  );

  bind(
    outputRecord,
    "brief",
    sourceText(
      outputRecord,
      sourceLocale,
      "briefAr",
      "briefEn",
    ),
    "briefAr",
    "briefEn",
  );

  bind(
    outputRecord,
    "notes",
    sourceText(
      outputRecord,
      sourceLocale,
      "notesAr",
      "notesEn",
      "notes",
    ),
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

  /* ========================================
     QUOTATION LINES
     IMPORTANT:
     safe flat keys — one AI call for all lines.
  ======================================== */

  if (Array.isArray(outputRecord.lines)) {
    outputRecord.lines.forEach(
      (
        rawLine,
        index,
      ) => {
        const line =
          asRecord(rawLine);

        if (!line) {
          return;
        }

        bind(
          line,
          `line_${index}_item_name`,
          sourceText(
            line,
            sourceLocale,
            "itemNameAr",
            "itemNameEn",
            "itemName",
          ),
          "itemNameAr",
          "itemNameEn",
          "itemName",
        );

        bind(
          line,
          `line_${index}_description`,
          sourceText(
            line,
            sourceLocale,
            "descriptionAr",
            "descriptionEn",
            "description",
          ),
          "descriptionAr",
          "descriptionEn",
          "description",
        );

        bind(
          line,
          `line_${index}_unit_name`,
          sourceText(
            line,
            sourceLocale,
            "unitNameAr",
            "unitNameEn",
            "unitName",
          ),
          "unitNameAr",
          "unitNameEn",
          "unitName",
        );
      },
    );
  }

  if (items.length === 0) {
    return output;
  }

  /*
   * Exactly ONE translation request
   * for the entire quotation.
   */
  const translated =
    await port.translateMany({
      sourceLocale,
      targetLocale,
      items,
    });

  /* ========================================
     APPLY TRANSLATED VALUES
  ======================================== */

  for (const binding of bindings) {
    const translatedText =
      asText(
        translated[
          binding.key
        ],
      );

    if (!translatedText) {
      throw new Error(
        `Quotation localization missing translation for "${binding.key}".`,
      );
    }

    setLocalizedPair(
      binding.target,
      sourceLocale,
      binding.arKey,
      binding.enKey,
      binding.source,
      translatedText,
    );

    if (binding.legacyKey) {
      binding.target[
        binding.legacyKey
      ] =
        binding.source;
    }
  }

  return output;
}