/**
 * Phase 2A-10: exhaustive bilingual (EN / AR) presentation for every token the
 * cross-document engine can produce.
 *
 * Discipline, following the accepted localization rules of this repository:
 *
 * - a structured finding record is stored with a `statementTemplateKey`; the
 *   sentence is rendered HERE, at presentation time, never stored;
 * - every token table is `Record<Token, { en, ar }>`, so a new enum value
 *   cannot ship without both languages;
 * - source literals are never translated, locators are never translated, and
 *   GlobalId / model / tag / property names remain verbatim;
 * - an Arabic brief never receives an English limitation: the Arabic path is
 *   an EXACT map, then a PATTERN map, then a generic Arabic fallback. The
 *   English sentence is never pasted into Arabic text;
 * - no winner language exists anywhere: no "correct quantity", no "should be",
 *   no "actual quantity", no "approved quantity", no "preferred source".
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import type { DocumentRole } from "./DocumentIdentity";
import { DOCUMENT_ROLES } from "./DocumentIdentity";
import type { ActiveRevisionDecisionStatus, DocumentIdentityKind, DocumentReadinessState, DocumentRelationKind } from "./DocumentIdentity";
import type { ClaimPredicate, QuantityOrigin, UnitDimension, ReadingChannel, RevisionContext, EvidenceCoverage, LineageRole, SubjectKeyNamespace } from "./EvidenceClaim";
import type { FindingKind, FindingSeverity, ReviewState, StaleReason } from "./CrossDocumentFindings";
import type { MatchTier, SubjectMatchClass } from "./SubjectMatching";

export type Locale = "en" | "ar";
export type BilingualLabel = { en: string; ar: string };

function label(table: Record<string, BilingualLabel>, token: string, fallback: BilingualLabel): BilingualLabel {
  return table[token] ?? fallback;
}

/** Renders one bilingual label entry for the active locale. */
export function bilingual(table: Record<string, BilingualLabel>, token: string, fallback: BilingualLabel, locale: Locale): string {
  const entry = label(table, token, fallback);
  return entry[locale];
}

// ---------------------------------------------------------------------------
// Finding kinds
// ---------------------------------------------------------------------------

export const FINDING_KIND_LABELS: Record<FindingKind, BilingualLabel> = {
  STATED_QUANTITY_MISMATCH: { en: "stated quantity differs between sources", ar: "الكمية المذكورة تختلف بين المصدرين" },
  MODEL_REFERENCE_MISMATCH: { en: "model or reference differs between sources", ar: "الطراز أو المرجع يختلف بين المصدرين" },
  MANUFACTURER_MISMATCH: { en: "manufacturer differs between sources", ar: "الصانع يختلف بين المصدرين" },
  BRAND_MISMATCH: { en: "brand differs between sources", ar: "الماركة تختلف بين المصدرين" },
  RATING_MISMATCH: { en: "rating differs between sources", ar: "التصنيف يختلف بين المصدرين" },
  UNIT_MISMATCH: { en: "the stated units are different units", ar: "الوحدات المذكورة وحدات مختلفة" },
  UNIT_NOT_COMPARABLE: { en: "the stated units cannot be proven equivalent", ar: "لا يمكن إثبات تكافؤ الوحدات المذكورة" },
  MATERIAL_MISMATCH: { en: "material differs between sources", ar: "المادة تختلف بين المصدرين" },
  LOCATION_MISMATCH: { en: "location differs between sources", ar: "الموقع يختلف بين المصدرين" },
  SYSTEM_ASSIGNMENT_MISMATCH: { en: "system assignment differs between sources", ar: "إسناد النظام يختلف بين المصدرين" },
  IDENTITY_TAG_MISMATCH: { en: "identity tag differs between sources", ar: "رمز التعريف يختلف بين المصدرين" },
  TYPE_MISMATCH: { en: "type name differs between sources", ar: "اسم النوع يختلف بين المصدرين" },
  CLASSIFICATION_MISMATCH: { en: "classification differs between sources", ar: "التصنيف يختلف بين المصدرين" },
  REVISION_MISMATCH: { en: "revisions labelled by the sources disagree", ar: "الإصدارات المذكورة في المصادر غير متوافقة" },
  REVISION_SET_BLOCKED: { en: "the revisions in scope have no governing active-revision decision", ar: "الإصدارات داخل النطاق بلا قرار حاكم بالإصدار الفعّال" },
  INCLUSION_EXCLUSION_MISMATCH: { en: "one source includes an item the other does not", ar: "أحد المصدرين يدرج بنداً لا يدرجه الآخر" },
  PROPERTY_MISSING_IN_SOURCE: { en: "a property present in one source is absent from the other", ar: "خاصية موجودة في أحد المصدرين غائبة في الآخر" },
  SCHEDULE_COUNTERPART_MISSING: { en: "no counterpart schedule line was found in the other source", ar: "لم يوجد بند جدول مقابل في المصدر الآخر" },
  AMBIGUOUS_SUBJECT_MATCH: { en: "the subject matches more than one item, so values were not compared", ar: "الموضوع يطابق أكثر من بند، ولذلك لم تُقارن القيم" },
  SUBJECT_SUGGESTION_ONLY: { en: "wording similarity suggests a link that needs a human decision", ar: "تشابه الصياغة يشير إلى ارتباط يحتاج قراراً بشرياً" },
  EVIDENCE_COVERAGE_INCOMPLETE: { en: "evidence from this source was truncated, so nothing can be read as missing", ar: "أدلة هذا المصدر مقتطعة، ولذلك لا يمكن اعتبار أي شيء غائباً" },
  EVIDENCE_UNAVAILABLE_FOR_COMPARISON: { en: "evidence from this source was not available for comparison", ar: "أدلة هذا المصدر غير متاحة للمقارنة" },
  DERIVATION_FIDELITY_REVIEW: { en: "the derived file's fidelity boundaries need review", ar: "حدود دقة الملف المشتق تحتاج مراجعة" },
  DESCRIPTION_MISMATCH: { en: "the descriptions differ between sources", ar: "الأوصاف تختلف بين المصدرين" },
};

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export const PREDICATE_LABELS: Record<ClaimPredicate, BilingualLabel> = {
  STATED_QUANTITY: { en: "stated quantity", ar: "الكمية المذكورة" },
  UNIT_DECLARATION: { en: "stated unit", ar: "الوحدة المذكورة" },
  MANUFACTURER: { en: "manufacturer", ar: "الصانع" },
  BRAND: { en: "brand", ar: "الماركة" },
  MODEL_REFERENCE: { en: "model or reference", ar: "الطراز أو المرجع" },
  CLASSIFICATION_CODE: { en: "classification code", ar: "رمز التصنيف" },
  TYPE_NAME: { en: "type name", ar: "اسم النوع" },
  EQUIPMENT_TAG: { en: "equipment tag", ar: "رمز المعدة" },
  IDENTITY_TAG: { en: "identity tag", ar: "رمز التعريف" },
  RATING: { en: "rating", ar: "التصنيف الفني" },
  MATERIAL: { en: "material", ar: "المادة" },
  LOCATION: { en: "location", ar: "الموقع" },
  SYSTEM_ASSIGNMENT: { en: "system assignment", ar: "إسناد النظام" },
  REVISION_LABEL: { en: "observed revision label", ar: "تسمية الإصدار المرصودة" },
  ITEM_NUMBER: { en: "item number", ar: "رقم البند" },
  SECTION_OR_DIVISION: { en: "section or division", ar: "القسم أو الفرع" },
  DOCUMENT_IDENTITY: { en: "document identity", ar: "هوية المستند" },
  PROPERTY_VALUE: { en: "property value", ar: "قيمة خاصية" },
  DESCRIPTION_TEXT: { en: "description text", ar: "نص الوصف" },
};

// ---------------------------------------------------------------------------
// Document roles, identity kinds, relations, readiness
// ---------------------------------------------------------------------------

export const DOCUMENT_ROLE_LABELS: Record<DocumentRole, BilingualLabel> = {
  SPECIFICATION: { en: "specification", ar: "مواصفات" },
  BOQ: { en: "bill of quantities", ar: "جدول كميات" },
  DRAWING: { en: "drawing", ar: "مخطط" },
  SCHEDULE: { en: "schedule", ar: "جدول" },
  BIM_MODEL: { en: "BIM model", ar: "نموذج BIM" },
  TENDER: { en: "tender document", ar: "مستند مناقصة" },
  ADDENDUM: { en: "addendum", ar: "ملحق" },
  SUBMITTAL: { en: "submittal", ar: "مستند تقديمي" },
  UNKNOWN: { en: "unclassified document", ar: "مستند غير مصنّف" },
};

export const DOCUMENT_IDENTITY_KIND_LABELS: Record<DocumentIdentityKind, BilingualLabel> = {
  DRAWING: { en: "drawing", ar: "مخطط" },
  SPECIFICATION_SECTION: { en: "specification section", ar: "قسم مواصفات" },
  BOQ_OR_SCHEDULE: { en: "bill of quantities or schedule", ar: "جدول كميات أو جدول" },
  BIM_MODEL: { en: "BIM model", ar: "نموذج BIM" },
  TENDER_PACKAGE: { en: "tender package", ar: "حزمة مناقصة" },
  SUBMITTAL: { en: "submittal", ar: "مستند تقديمي" },
  UNRESOLVED: { en: "unresolved document", ar: "مستند غير محدد" },
};

export const DOCUMENT_RELATION_LABELS: Record<DocumentRelationKind, BilingualLabel> = {
  REVISION_OF: { en: "a revision of", ar: "إصدار من" },
  SUPERSEDES: { en: "supersedes", ar: "يلغي" },
  ADDENDUM_TO: { en: "an addendum to", ar: "ملحق لـ" },
  REFERENCES: { en: "references", ar: "يشير إلى" },
  SAME_FAMILY: { en: "belongs to the same document family as", ar: "ينتمي إلى نفس عائلة المستند" },
};

export const READINESS_LABELS: Record<DocumentReadinessState, BilingualLabel> = {
  READY: { en: "ready for comparison", ar: "جاهز للمقارنة" },
  BLOCKED_REVISION_DECISION: { en: "blocked pending an active-revision decision", ar: "متوقف بانتظار قرار الإصدار الفعّال" },
  BLOCKED_AMBIGUOUS_IDENTITY: { en: "blocked by an ambiguous document identity", ar: "متوقف بسبب هوية مستند غير مؤكدة" },
  PARTIAL_EVIDENCE: { en: "partially covered evidence", ar: "الأدلة مغطاة جزئياً" },
  UNDECIDED: { en: "not yet decided", ar: "لم يُحسم بعد" },
};

export const ACTIVE_REVISION_STATUS_LABELS: Record<ActiveRevisionDecisionStatus, BilingualLabel> = {
  UNDECIDED: { en: "no active revision has been decided", ar: "لم يُحدد إصدار فعّال بعد" },
  ACTIVE_REVISION_SELECTED: { en: "an active revision is selected", ar: "تم تحديد إصدار فعّال" },
  BLOCKED_INCOMPATIBLE_ACTIVES: { en: "incompatible active revisions block comparison", ar: "إصدارات فعّالة غير متوافقة تمنع المقارنة" },
};

// ---------------------------------------------------------------------------
// Review states, match classes, quantity origins, units, staleness, revisions
// ---------------------------------------------------------------------------

export const REVIEW_STATE_LABELS: Record<ReviewState, BilingualLabel> = {
  OPEN: { en: "open", ar: "مفتوح" },
  ACKNOWLEDGED: { en: "acknowledged", ar: "تم الاطلاع" },
  NEEDS_INFORMATION: { en: "needs information", ar: "يحتاج معلومات" },
  RESOLVED: { en: "resolved", ar: "مغلق بالمتابعة" },
  DISMISSED: { en: "dismissed", ar: "مُستبعد" },
};

export const MATCH_CLASS_LABELS: Record<SubjectMatchClass, BilingualLabel> = {
  SAME_SUBJECT: { en: "same subject", ar: "نفس الموضوع" },
  AMBIGUOUS: { en: "ambiguous", ar: "ملتبس" },
  SUGGESTION_ONLY: { en: "suggestion only", ar: "اقتراح فقط" },
  CONFLICT: { en: "conflicting identifiers", ar: "معرّفات متعارضة" },
  NO_MATCH: { en: "no match", ar: "لا مطابقة" },
};

export const MATCH_TIER_LABELS: Record<MatchTier, BilingualLabel> = {
  T0_EXACT_GLOBAL_ID: { en: "exact GlobalId match", ar: "تطابق GlobalId تام" },
  T1_EXACT_TAG: { en: "exact equipment tag match", ar: "تطابق تام في رمز المعدة" },
  T2_EXACT_MANUFACTURER_MODEL: { en: "exact manufacturer and model match", ar: "تطابق تام في الصانع والطراز" },
  T2_EXACT_CLASSIFICATION: { en: "same classification code in the same scheme", ar: "نفس رمز التصنيف في نفس النظام" },
  T2_EXACT_TYPE_NAME: { en: "exact type-name match", ar: "تطابق تام في اسم النوع" },
  T3_EXACT_ITEM_NUMBER: { en: "exact item number within one document family", ar: "تطابق تام في رقم البند داخل عائلة مستند واحدة" },
  T4_LOCATION_SYSTEM_CORROBORATION: { en: "location and system corroboration only", ar: "تأكيد بالموقع والنظام فقط" },
  T5_TOKEN_SIMILARITY_SUGGESTION: { en: "wording similarity suggestion only", ar: "اقتراح تشابه في الصياغة فقط" },
};

export const QUANTITY_ORIGIN_LABELS: Record<QuantityOrigin, BilingualLabel> = {
  STATED: { en: "stated by the source", ar: "مذكورة في المصدر" },
  DECLARED_MODEL: { en: "declared by the model", ar: "معلنة في النموذج" },
};

export const UNIT_DIMENSION_LABELS: Record<UnitDimension, BilingualLabel> = {
  COUNT: { en: "count", ar: "عدد" },
  LENGTH: { en: "length", ar: "طول" },
  AREA: { en: "area", ar: "مساحة" },
  VOLUME: { en: "volume", ar: "حجم" },
  MASS: { en: "mass", ar: "كتلة" },
  TIME: { en: "time", ar: "زمن" },
  POWER: { en: "power", ar: "قدرة" },
  TEMPERATURE: { en: "temperature", ar: "درجة حرارة" },
  PRESSURE: { en: "pressure", ar: "ضغط" },
  FLOW: { en: "flow", ar: "تدفق" },
  OTHER: { en: "other", ar: "أخرى" },
};

export const STALE_REASON_LABELS: Record<StaleReason, BilingualLabel> = {
  NOT_REPRODUCED: { en: "not reproduced by the latest run", ar: "لم تُعد إنتاجه في أحدث تشغيل" },
  ARTIFACT_BYTES_CHANGED: { en: "the source bytes changed", ar: "تغيّرت بايتات المصدر" },
  SCOPE_CHANGED: { en: "the comparison scope changed", ar: "تغيّر نطاق المقارنة" },
  ENGINE_VERSION_CHANGED: { en: "the comparison engine version changed", ar: "تغيّر إصدار محرك المقارنة" },
  CLAIMS_SUPERSEDED: { en: "the underlying evidence claims were superseded", ar: "استُبدلت مطالبات الأدلة الأساسية" },
};

export const REVISION_CONTEXT_LABELS: Record<RevisionContext, BilingualLabel> = {
  UNDETERMINED: { en: "no revision context was established", ar: "لم يُحدد سياق الإصدار" },
  OBSERVED: { en: "an observed revision label", ar: "تسمية إصدار مرصودة" },
  SUPERSEDED: { en: "a superseded revision", ar: "إصدار ملغى" },
  ADDENDUM: { en: "an addendum", ar: "ملحق" },
};

export const READING_CHANNEL_LABELS: Record<ReadingChannel, BilingualLabel> = {
  PDF_NATIVE_TEXT: { en: "native PDF text", ar: "نص PDF أصلي" },
  PDF_OCR_TEXT: { en: "OCRed PDF text", ar: "نص PDF مقروء آلياً" },
  IMAGE_VISION: { en: "image reading", ar: "قراءة صورة" },
  DRAWING_VISION: { en: "drawing reading", ar: "قراءة مخطط" },
  DRAWING_STRUCTURED: { en: "structured drawing evidence", ar: "أدلة مخطط مهيكلة" },
  WORKBOOK_STRUCTURED: { en: "structured workbook evidence", ar: "أدلة جدول مهيكلة" },
  DXF_STRUCTURED: { en: "structured DXF evidence", ar: "أدلة DXF مهيكلة" },
  IFC_MODEL: { en: "IFC model evidence", ar: "أدلة نموذج IFC" },
};

export const COVERAGE_LABELS: Record<EvidenceCoverage, BilingualLabel> = {
  COMPLETE: { en: "complete evidence coverage", ar: "تغطية أدلة كاملة" },
  PARTIAL: { en: "partial evidence coverage", ar: "تغطية أدلة جزئية" },
};

export const LINEAGE_ROLE_LABELS: Record<LineageRole, BilingualLabel> = {
  STANDALONE: { en: "a standalone document", ar: "مستند مستقل" },
  DERIVED_INSPECTED: { en: "a derived file inspected in place of its proprietary original", ar: "ملف مشتق تم فحصه بدلاً من أصله الاحتكاري" },
  ORIGINAL_PROPRIETARY: { en: "a proprietary original that supplies lineage only", ar: "أصل احتكاري يوفر النسب فقط" },
};

export const SUBJECT_NAMESPACE_LABELS: Record<SubjectKeyNamespace, BilingualLabel> = {
  GLOBAL_ID: { en: "GlobalId", ar: "GlobalId" },
  EQUIPMENT_TAG: { en: "equipment tag", ar: "رمز المعدة" },
  MANUFACTURER_MODEL: { en: "manufacturer and model", ar: "الصانع والطراز" },
  CLASSIFICATION_CODE: { en: "classification code", ar: "رمز التصنيف" },
  TYPE_NAME: { en: "type name", ar: "اسم النوع" },
  ITEM_NUMBER: { en: "item number", ar: "رقم البند" },
  DRAWING_SHEET: { en: "drawing or sheet", ar: "مخطط أو لوحة" },
  SECTION_DIVISION: { en: "section or division", ar: "قسم أو فرع" },
  DOCUMENT_IDENTITY: { en: "document identity", ar: "هوية المستند" },
  TEXT_LABEL: { en: "text label", ar: "تسمية نصية" },
  ARTIFACT_LOCATOR: { en: "artifact locator", ar: "موقع في المصدر" },
};

export const SEVERITY_LABELS: Record<FindingSeverity, BilingualLabel> = {
  INFO: { en: "for information", ar: "للعلم" },
  REVIEW: { en: "needs review", ar: "يحتاج مراجعة" },
  ATTENTION: { en: "needs attention", ar: "يحتاج انتباهاً" },
};

// ---------------------------------------------------------------------------
// Generic labels and safe fallbacks
// ---------------------------------------------------------------------------

export const GENERIC_FALLBACK_LABEL: BilingualLabel = { en: "recorded evidence", ar: "دليل مسجّل" };
export const UNKNOWN_PREDICATE_LABEL: BilingualLabel = { en: "recorded evidence", ar: "دليل مسجّل" };
export const UNKNOWN_FINDING_LABEL: BilingualLabel = { en: "a recorded difference between sources", ar: "فرق مسجّل بين المصدرين" };

/** Labels every token family, so an unknown token never reaches a reader raw. */
export function findingKindLabel(kind: string, locale: Locale): string {
  return bilingual(FINDING_KIND_LABELS as unknown as Record<string, BilingualLabel>, kind, UNKNOWN_FINDING_LABEL, locale);
}

export function predicateLabel(predicate: string, locale: Locale): string {
  return bilingual(PREDICATE_LABELS as unknown as Record<string, BilingualLabel>, predicate, UNKNOWN_PREDICATE_LABEL, locale);
}

export function documentRoleLabel(role: string, locale: Locale): string {
  return bilingual(DOCUMENT_ROLE_LABELS as unknown as Record<string, BilingualLabel>, role, { en: "unclassified document", ar: "مستند غير مصنّف" }, locale);
}

export function reviewStateLabel(state: string, locale: Locale): string {
  return bilingual(REVIEW_STATE_LABELS as unknown as Record<string, BilingualLabel>, state, { en: "open", ar: "مفتوح" }, locale);
}

export function matchClassLabel(matchClass: string, locale: Locale): string {
  return bilingual(MATCH_CLASS_LABELS as unknown as Record<string, BilingualLabel>, matchClass, { en: "no match", ar: "لا مطابقة" }, locale);
}

export function quantityOriginLabel(origin: string, locale: Locale): string {
  return bilingual(QUANTITY_ORIGIN_LABELS as unknown as Record<string, BilingualLabel>, origin, { en: "stated by the source", ar: "مذكورة في المصدر" }, locale);
}

export function unitDimensionLabel(dimension: string, locale: Locale): string {
  return bilingual(UNIT_DIMENSION_LABELS as unknown as Record<string, BilingualLabel>, dimension, { en: "an unrecognized unit dimension", ar: "بُعد وحدة غير معروف" }, locale);
}

export function staleReasonLabel(reason: string, locale: Locale): string {
  return bilingual(STALE_REASON_LABELS as unknown as Record<string, BilingualLabel>, reason, { en: "the finding is not current", ar: "النتيجة غير محدثة" }, locale);
}

export function revisionContextLabel(context: string, locale: Locale): string {
  return bilingual(REVISION_CONTEXT_LABELS as unknown as Record<string, BilingualLabel>, context, { en: "no revision context was established", ar: "لم يُحدد سياق الإصدار" }, locale);
}

export function readinessLabel(state: string, locale: Locale): string {
  return bilingual(READINESS_LABELS as unknown as Record<string, BilingualLabel>, state, { en: "not yet decided", ar: "لم يُحسم بعد" }, locale);
}

/** Every document role spelled out, used to prove the table is exhaustive. */
export const ALL_DOCUMENT_ROLE_LABELS: ReadonlyArray<{ role: DocumentRole; label: BilingualLabel }> = DOCUMENT_ROLES.map((role) => ({ role, label: DOCUMENT_ROLE_LABELS[role] }));

// ---------------------------------------------------------------------------
// Arabic limitation rendering: exact map → pattern map → generic fallback
// ---------------------------------------------------------------------------

const LIMITATION_ARABIC_EXACT: ReadonlyMap<string, string> = new Map<string, string>([
  [
    "a suggested document identity is evidence, not a confirmed database identity; confirming it is a governance action",
    "هوية المستند المقترحة دليل وليست هوية مؤكدة في قاعدة البيانات؛ وتأكيدها إجراء حوكمة",
  ],
  [
    "commercial rate, amount, and currency values stay source-native commercial evidence and are never materialized as comparison claims",
    "قيم السعر والمبلغ والعملة تبقى أدلة تجارية في مصدرها ولا تُحوّل إلى مطالبات مقارنة",
  ],
  [
    "the original proprietary artifact supplies lineage, filename, hash, derivation method, converter identity, and fidelity limitations only; no claim was fabricated from bytes VOKA cannot parse",
    "الأصل الاحتكاري يوفر النسب واسم الملف والبصمة وطريقة الاشتقاق وهوية المحوّل وحدود الدقة فقط؛ ولم تُنشأ أي مطالبة من بايتات لا يستطيع VOKA قراءتها",
  ],
]);

const LIMITATION_ARABIC_PATTERNS: ReadonlyArray<[RegExp, (match: RegExpMatchArray) => string]> = [
  [
    /^the accepted (.+) inspection was truncated by its own safety bounds, so absence of evidence from this source is not asserted$/u,
    (match) => `فُحص ${match[1]} ضمن حدوده الآمنة واقتُطع، ولذلك لا يُدّعى غياب أي دليل من هذا المصدر`,
  ],
  [
    /^only (\d+) of (.+) evidence records were materialized; the remainder exceeded the materialization bound$/u,
    (match) => `تم تحويل ${match[1]} سجلاً من أدلة ${match[2]} فقط؛ وتجاوز الباقي حد التحويل`,
  ],
  [
    /^this source channel is bounded and its own inspection reported truncation$/u,
    () => "قناة هذا المصدر محدودة وقد أبلغ فحصها عن اقتطاع",
  ],
];

/** Generic Arabic fallback. It never repeats the English sentence. */
export const UNKNOWN_LIMITATION_ARABIC = "يوجد قيد إضافي على هذه المقارنة مسجّل في السجل المهيكل";

/**
 * Arabic wording for a recorded limitation.
 *
 * Exported so the fallback is exercised directly: it is the branch that
 * guarantees English never reaches an Arabic brief.
 */
export function arabicLimitation(limitation: string): string {
  const exact = LIMITATION_ARABIC_EXACT.get(limitation);
  if (exact) return exact;
  for (const [pattern, render] of LIMITATION_ARABIC_PATTERNS) {
    const match = limitation.match(pattern);
    if (match) return render(match);
  }
  return UNKNOWN_LIMITATION_ARABIC;
}

/** Localizes a limitation sentence. English limitations pass through verbatim. */
export function localizeLimitation(limitation: string, locale: Locale): string {
  return locale === "ar" ? arabicLimitation(limitation) : limitation;
}

/** Localizes a bounded list, keeping the presentation bounded. */
export function localizeLimitations(limitations: readonly string[], locale: Locale, max = 6): string[] {
  return limitations.slice(0, max).map((limitation) => localizeLimitation(limitation, locale));
}

/**
 * A technical source token that naturally stays Latin in Arabic output.
 *
 * GlobalIds, model references, tags, property names, locators, and status
 * tokens are source material: they are quoted verbatim in both languages.
 */
export function isTechnicalSourceToken(value: string): boolean {
  return /^[\x20-\x7E]+$/u.test(value);
}
