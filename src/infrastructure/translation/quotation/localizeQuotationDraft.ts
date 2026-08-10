import { analyzeQuotationLocalization } from "../../../application/quotation/services/QuotationLocalizationAnalyzer";
import { createTranslationPort } from "../createTranslationPort";

type UnknownRecord = Record<string, unknown>;

function asText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

function setLocalizedPair(
  target: UnknownRecord,
  sourceLocale: "ar" | "en",
  arKey: string,
  enKey: string,
  source: string,
  translated: string,
): void {
  if (sourceLocale === "ar") {
    target[arKey] = source;
    target[enKey] = translated;
    return;
  }

  target[enKey] = source;
  target[arKey] = translated;
}

export async function localizeQuotationDraft<T extends UnknownRecord>(
  input: T,
): Promise<T> {
  const port = createTranslationPort();

  if (!port) {
    return input;
  }

  const output = structuredClone(input) as T;
  const outputRecord = output as UnknownRecord;

  const analysis = analyzeQuotationLocalization(
    outputRecord,
    outputRecord.localizationSourceLocale as "ar" | "en" | undefined,
  );

  if (analysis.items.length === 0) {
    return output;
  }

  const translated = await port.translateMany({
    sourceLocale: analysis.sourceLocale,
    targetLocale: analysis.sourceLocale === "ar" ? "en" : "ar",
    items: analysis.items,
  });

  for (const binding of analysis.bindings) {
    const translatedText = asText(translated[binding.key]);

    if (!translatedText) {
      throw new Error(
        `Quotation localization missing translation for "${binding.key}".`,
      );
    }

    setLocalizedPair(
      binding.target,
      analysis.sourceLocale,
      binding.arKey,
      binding.enKey,
      binding.source,
      translatedText,
    );

    if (binding.legacyKey) {
      binding.target[binding.legacyKey] = binding.source;
    }
  }

  return output;
}
