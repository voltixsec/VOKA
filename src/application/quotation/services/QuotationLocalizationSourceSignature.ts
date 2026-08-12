import { createHash } from "node:crypto";

type LocalizationSourceAnalysis = {
  sourceLocale: "ar" | "en";
  items: ReadonlyArray<{
    key: string;
    text: string;
  }>;
};

export function createQuotationLocalizationSourceSignature(
  analysis: LocalizationSourceAnalysis,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      sourceLocale: analysis.sourceLocale,
      items: analysis.items.map(({ key, text }) => ({ key, text })),
    }))
    .digest("hex");
}
