import type { ArtifactDerivationKind, ArtifactDerivationMethod } from "@/src/domain/source-artifact";
import { MAX_DERIVATION_FIDELITY_LIMITATIONS } from "@/src/domain/source-artifact";
import type { ArtifactInspectionStatus, ArtifactInspectionSummary } from "./ArtifactInspectionProjection";

/**
 * Phase 2A-9: bounded assistant-facing projection for proprietary ORIGINAL
 * artifacts (DWG / RVT) and for derivation LINEAGE around a derived DXF/IFC.
 *
 * Two separate concerns, one module:
 *
 * 1. An ORIGINAL proprietary artifact is stored but never inspected. Its
 *    projection carries identity, the recognized version signature when one
 *    was read from the immutable bytes, and truthful guidance naming the
 *    export path. It never claims the file was parsed.
 * 2. A DERIVED artifact keeps its full accepted DXF/IFC evidence projection.
 *    Lineage is AUGMENTED around it: that it is derived, from which original,
 *    by which method, between which formats, and with which static fidelity
 *    limitations. Provider internals are never dumped into the context.
 *
 * Raw enum tokens are never printed; every token has a plain-words label in
 * both languages.
 */

export const MAX_PROJECTED_LINEAGE_LIMITATIONS = 4;

export type ProjectedProprietaryOriginal = {
  attempted: boolean;
  /** Always false: a proprietary original is never semantically inspected. */
  used: false;
  format: "DWG" | "RVT";
  /** Release signature read from the bytes, e.g. "AC1027"; null when unknown. */
  versionCode: string | null;
  /** Published release name when the code is known; null otherwise. */
  versionLabel: string | null;
  /** False when an RVT could not be corroborated as Revit from its bytes. */
  verified: boolean;
  limitations: string[];
};

export function emptyProjectedProprietaryOriginal(): ProjectedProprietaryOriginal {
  return { attempted: false, used: false, format: "DWG", versionCode: null, versionLabel: null, verified: false, limitations: [] };
}

export type ProjectedDerivationLineage = {
  derived: true;
  derivationKind: ArtifactDerivationKind;
  originalArtifactId: string;
  originalFilename: string;
  derivedArtifactId: string;
  method: ArtifactDerivationMethod;
  /** Plain words for the method; the enum token is never printed. */
  methodLabel: string;
  methodLabelArabic: string;
  sourceFormat: "DWG" | "RVT";
  derivedFormat: "DXF" | "IFC";
  /** Channel B: static VOKA fidelity limitations, bounded. Warnings are never dumped. */
  limitations: string[];
  completedAt: string | null;
};

export const DERIVATION_METHOD_LABELS: Record<ArtifactDerivationMethod, { en: string; ar: string }> = {
  AUTOMATED_CONVERSION: { en: "automated conversion", ar: "تحويل آلي" },
  USER_PROVIDED_EXPORT: { en: "an export you provided", ar: "نسخة مُصدَّرة قدّمتها أنت" },
};

/**
 * Builds the bounded lineage record from a persisted derivation row and the
 * original artifact's filename. Everything user-facing passes through here,
 * so provider internals cannot leak into the projection.
 */
export function projectDerivationLineage(input: {
  derivation: {
    derivationKind: ArtifactDerivationKind;
    derivationMethod: ArtifactDerivationMethod;
    originalArtifactId: string;
    derivedArtifactId: string | null;
    sourceFormat: string;
    derivedFormat: string;
    fidelityLimitations: string[];
    completedAt: Date | null;
  };
  originalFilename: string;
}): ProjectedDerivationLineage | null {
  if (!input.derivation.derivedArtifactId) return null;
  return {
    derived: true,
    derivationKind: input.derivation.derivationKind,
    originalArtifactId: input.derivation.originalArtifactId,
    originalFilename: input.originalFilename,
    derivedArtifactId: input.derivation.derivedArtifactId,
    method: input.derivation.derivationMethod,
    methodLabel: DERIVATION_METHOD_LABELS[input.derivation.derivationMethod].en,
    methodLabelArabic: DERIVATION_METHOD_LABELS[input.derivation.derivationMethod].ar,
    sourceFormat: input.derivation.sourceFormat === "RVT" ? "RVT" : "DWG",
    derivedFormat: input.derivation.derivedFormat === "IFC" ? "IFC" : "DXF",
    limitations: input.derivation.fidelityLimitations.slice(0, MAX_PROJECTED_LINEAGE_LIMITATIONS),
    completedAt: input.derivation.completedAt ? input.derivation.completedAt.toISOString() : null,
  };
}

const PROPRIETARY_FORMAT_WORDS: Record<"DWG" | "RVT", { en: string; ar: string }> = {
  DWG: { en: "a binary DWG drawing", ar: "رسم DWG ثنائي" },
  RVT: { en: "a Revit project (RVT)", ar: "مشروع Revit (RVT)" },
};

/**
 * Truthful, bounded guidance for a proprietary original.
 *
 * It states what the file is, the version signature when one was read, that
 * VOKA does not parse this format directly in this deployment, the explicit
 * export path, and that the export can be linked back to this original. It
 * never promises a lossless export and never claims any inspection happened.
 */
export function renderProprietaryOriginalGuidance(summary: ArtifactInspectionSummary, locale: "ar" | "en" = "en"): string {
  const ar = locale === "ar";
  const original = summary.proprietaryOriginal;
  const formatWords = PROPRIETARY_FORMAT_WORDS[original.format];
  const versionBit = original.versionCode
    ? (ar
      ? ` (توقيع الإصدار ${original.versionCode}${original.versionLabel ? ` — ${original.versionLabel}` : ""})`
      : ` (version signature ${original.versionCode}${original.versionLabel ? ` — ${original.versionLabel}` : ""})`)
    : "";
  const linkBit = ar
    ? `يمكن بعد ذلك ربط الملف المُصدَّر بهذا الأصل المحفوظ.`
    : `The exported file can then be linked back to this retained original.`;
  const losslessBit = ar
    ? `التصدير ليس مضموناً أنه بلا فقدان.`
    : `An export is not guaranteed to be lossless.`;
  if (original.format === "DWG") {
    if (ar) {
      return `هذا ${formatWords.ar}${versionBit}. لا يقرأ VOKA ملفات DWG مباشرة في هذه البيئة. صدّره كملف ASCII DXF وأرفق الملف المُصدَّر؛ ${linkBit} ${losslessBit}`;
    }
    return `This is ${formatWords.en}${versionBit}. VOKA does not parse DWG directly in this deployment. Export it as ASCII DXF and attach the exported file; ${linkBit} ${losslessBit}`;
  }
  if (ar) {
    return `هذا ${formatWords.ar}${versionBit}. لا يقرأ VOKA ملفات RVT مباشرة في هذه البيئة. صدّره كنموذج IFC وأرفق الملف المُصدَّر؛ ${linkBit} ${losslessBit}`;
  }
  return `This is ${formatWords.en}${versionBit}. VOKA does not parse RVT directly in this deployment. Export it as IFC and attach the exported model; ${linkBit} ${losslessBit}`;
}

/**
 * Lineage sentence for a derived DXF/IFC inspection brief.
 *
 * The wording distinguishes the two channels honestly: a user-provided export
 * is described as provided by the user (VOKA never claims it converted), and
 * an automated conversion is described as a conversion that is not certified
 * lossless.
 */
export function renderDerivationLineageSentence(lineage: ProjectedDerivationLineage, locale: "ar" | "en" = "en"): string {
  const ar = locale === "ar";
  if (lineage.method === "USER_PROVIDED_EXPORT") {
    if (lineage.sourceFormat === "DWG") {
      return ar
        ? `ملف الـDXF هذا نُقل إلينا كنسخة مُصدَّرة من المخطط الأصلي '${lineage.originalFilename}'.`
        : `This DXF was provided as an export derived from the original DWG drawing '${lineage.originalFilename}'.`;
    }
    return ar
      ? `ملف الـIFC هذا نُقل إلينا كنسخة مُصدَّرة من نموذج Revit الأصلي '${lineage.originalFilename}'.`
      : `This IFC was provided as an export derived from the original Revit model '${lineage.originalFilename}'.`;
  }
  if (lineage.sourceFormat === "DWG") {
    return ar
      ? `أُنشئ ملف الـDXF هذا بتحويل المخطط الأصلي '${lineage.originalFilename}' آلياً؛ والتحويل غير مضمون أنه بلا فقدان.`
      : `This DXF was produced by an automated conversion of the original DWG drawing '${lineage.originalFilename}'; the conversion is not guaranteed to be lossless.`;
  }
  return ar
    ? `أُنشئ ملف الـIFC هذا بتحويل نموذج Revit الأصلي '${lineage.originalFilename}' آلياً؛ والتحويل غير مضمون أنه بلا فقدان.`
    : `This IFC was produced by an automated conversion of the original Revit model '${lineage.originalFilename}'; the conversion is not guaranteed to be lossless.`;
}

/** Plain-words proprietary original status word for briefs. */
export function proprietaryStatusWord(status: ArtifactInspectionStatus, ar: boolean): string {
  const map: Partial<Record<ArtifactInspectionStatus, { ar: string; en: string }>> = {
    UNAVAILABLE: { ar: "غير قابل للقراءة الدلالية في هذه البيئة", en: "not semantically readable in this deployment" },
    INSPECTED: { ar: "تم الفحص", en: "inspected" },
    NOT_INSPECTED: { ar: "لم يتم الفحص", en: "not inspected" },
  };
  return (map[status] ?? { ar: "لم يتم الفحص", en: "not inspected" })[ar ? "ar" : "en"];
}

// ---------------------------------------------------------------------------
// Phase 2A-9 §25: truthful bilingual status wording for derivation outcomes.
// Raw internal enum tokens are never printed; technical format names (DWG,
// DXF, RVT, IFC, VOKA) stay Latin where natural.
// ---------------------------------------------------------------------------

/**
 * Plain-words bilingual message for a derivation outcome.
 *
 * `reason` may be a provider/configuration detail; it is quoted as the cause,
 * never shown as a VOKA claim. Nothing here promises losslessness or claims a
 * conversion happened when it did not.
 */
export function renderDerivationStatusMessage(input: {
  status: "PENDING" | "RUNNING" | "AWAITING_USER_EXPORT" | "SUCCEEDED" | "FAILED" | "NOT_CONFIGURED" | "REJECTED";
  sourceFormat: "DWG" | "RVT";
  derivedFormat: "DXF" | "IFC";
  originalFilename?: string | null;
  reason?: string | null;
  locale: "ar" | "en";
}): string {
  const ar = input.locale === "ar";
  const original = input.originalFilename ? `'${input.originalFilename}'` : (ar ? "الأصل" : "the original");
  const cause = input.reason ? (ar ? ` السبب: ${input.reason}` : ` Reason: ${input.reason}`) : "";
  switch (input.status) {
    case "NOT_CONFIGURED":
      return ar
        ? `لم تُنفّذ عملية التحويل لهذا ${input.sourceFormat === "DWG" ? "المخطط" : "النموذج"} لأن VOKA لا يملك مُحوّلاً مهيّأً في هذه البيئة. يمكنك تصدير ${input.derivedFormat === "DXF" ? "ملف ASCII DXF" : "نموذج IFC"} من التطبيق المصدر وربط الملف المُصدَّر بالأصل المحفوظ.${cause}`
        : `No conversion was performed because VOKA has no conversion provider configured in this deployment. You can export ${input.derivedFormat === "DXF" ? "an ASCII DXF" : "an IFC model"} from the authoring application and link the exported file to the retained original.${cause}`;
    case "REJECTED":
      return ar
        ? `رُفض ناتج التحويل لملف ${original} لأنه لم يُقبل كملف ${input.derivedFormat === "DXF" ? "DXF نصي سليم" : "IFC نصي سليم"}؛ لم يُخزّن أي ناتج.${cause}`
        : `The conversion output for ${original} was rejected because it was not accepted as a valid textual ${input.derivedFormat} file; no output was stored.${cause}`;
    case "FAILED":
      return ar
        ? `فشل التحويل لملف ${original}؛ لم يُنشأ أي ملف مشتق.${cause}`
        : `The conversion of ${original} failed; no derived file was created.${cause}`;
    case "PENDING":
    case "RUNNING":
      return ar
        ? `تحويل ${original} قيد المعالجة ولم يكتمل بعد.`
        : `The conversion of ${original} is in progress and has not completed yet.`;
    case "AWAITING_USER_EXPORT":
      return ar
        ? `بانتظار تصديرك: أنشئ ملف ${input.derivedFormat === "DXF" ? "ASCII DXF" : "IFC"} من ${original} في التطبيق المصدر، ثم اربط الملف المُصدَّر بالأصل المحفوظ. التصدير ليس مضموناً أنه بلا فقدان.`
        : `Awaiting your export: create ${input.derivedFormat === "DXF" ? "an ASCII DXF" : "an IFC model"} from ${original} in the authoring application, then link the exported file to the retained original. An export is not guaranteed to be lossless.`;
    case "SUCCEEDED":
      return ar
        ? `أُنشئ الملف المشتق لـ${original}. التنبيه: التحويل غير مضمون أنه بلا فقدان؛ راجع قيود الدقة المسجلة.`
        : `The derived file for ${original} was created. Note: the conversion is not guaranteed to be lossless; review the recorded fidelity limitations.`;
  }
}
