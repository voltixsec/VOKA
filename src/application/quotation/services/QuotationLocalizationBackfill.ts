import { analyzeQuotationLocalization } from "./QuotationLocalizationAnalyzer";

export type ClassificationResult =
  | {
      status: "PENDING" | "COMPLETED";
      sourceLocale: "ar" | "en" | null;
      needsLocalization: boolean;
    };

export type ApplyPatch = {
  localizationStatus: "PENDING" | "COMPLETED";
  localizationSourceLocale: "AR" | "EN" | null;
  localizationRequestedAt: null;
  localizationCompletedAt: null;
  localizationLastError: null;
};

export type ProcessResult =
  | { skipped: true }
  | { skipped: false; would: ClassificationResult }
  | { skipped: false; applied: true; appliedPatch: ApplyPatch };

export function classifyQuotationSnapshot<T extends Record<string, unknown>>(
  snapshot: T,
): ClassificationResult {
  const analysis = analyzeQuotationLocalization(snapshot as unknown as Record<string, unknown>);

  if (analysis.items.length > 0) {
    return {
      status: "PENDING",
      sourceLocale: analysis.sourceLocale,
      needsLocalization: true,
    };
  }

  return {
    status: "COMPLETED",
    sourceLocale: null,
    needsLocalization: false,
  };
}

/**
 * Process a single historical quotation record.
 * - `currentStatus` is the DB value for `localizationStatus` (string | null).
 * - `updateFn` is a narrow updater used only in apply mode; it receives the
 *    prepared lifecycle patch and should perform the persistence.
 * Returns an object describing the outcome; throws only for programmer errors.
 */
export async function processQuotationForBackfill<T extends Record<string, unknown>>(
  snapshot: T,
  currentStatus: string | null,
  apply: boolean,
  updateFn: (patch: {
    localizationStatus: "PENDING" | "COMPLETED";
    localizationSourceLocale: "AR" | "EN" | null;
    localizationRequestedAt: null;
    localizationCompletedAt: null;
    localizationLastError: null;
  }) => Promise<{ updatedCount: number }> ,
): Promise<ProcessResult> {
  if (currentStatus !== null) {
    return { skipped: true };
  }

  const classification = classifyQuotationSnapshot(snapshot);

  if (!apply) {
    return {
      skipped: false,
      would: classification,
    };
  }

  const patch = {
    localizationStatus: classification.status,
    localizationSourceLocale:
      classification.sourceLocale === "ar"
        ? "AR"
        : classification.sourceLocale === "en"
        ? "EN"
        : null,
    localizationRequestedAt: null,
    localizationCompletedAt: null,
    localizationLastError: null,
  } as const;

  const result = await updateFn(patch);

  if (result && result.updatedCount === 0) {
    return { skipped: true };
  }

  return { skipped: false, applied: true, appliedPatch: patch };
}
