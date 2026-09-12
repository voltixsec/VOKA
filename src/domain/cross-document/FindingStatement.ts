/**
 * Phase 2A-10: bilingual finding statements, rendered at presentation time from
 * a structured finding plus its participants.
 *
 * The stored record keeps a `statementTemplateKey`; the sentence is produced
 * here. Source literals, units, locators, GlobalIds, tags, and property names
 * are quoted verbatim in BOTH languages — they are source material, never
 * translated.
 *
 * The wording is deliberately neutral: it reports what each source states and
 * never names a winner, a correct value, an approved quantity, or a preferred
 * source. There is no "should be", no "actual quantity", and no "correct
 * quantity" anywhere in this module.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import type { FindingKind, FindingParticipant } from "./CrossDocumentFindings";
import { findingKindLabel, localizeLimitation, quantityOriginLabel, type Locale } from "./CrossDocumentLabels";

export type RenderedFindingStatement = {
  locale: Locale;
  statementTemplateKey: string;
  /** The rendered sentence. */
  text: string;
  /** One line per participant, in stable display order. Never ranked. */
  participantLines: string[];
};

/** Renders a locator verbatim: a locator is never translated and never normalized. */
export function verbatimLocator(participant: FindingParticipant): string {
  return participant.locator;
}

/**
 * Renders one participant clause, optionally with its source label.
 *
 * The clause always carries the SOURCE for the value it quotes, so a reader can
 * always tell which document stated what.
 */
export function renderParticipantLine(participant: FindingParticipant, locale: Locale, sourceLabel: string | null): string {
  const unit = participant.unit ? ` ${participant.unit}` : "";
  const numeric = participant.sourceNumericView !== null ? ` (${participant.sourceNumericView})` : "";
  const origin = participant.quantityOrigin ? quantityOriginLabel(participant.quantityOrigin, locale) : null;
  const source = sourceLabel ? (locale === "ar" ? `المصدر ${sourceLabel}` : `${sourceLabel}`) : null;
  if (locale === "ar") {
    const head = source ? `${source}: ` : "";
    const originBit = origin ? ` — ${origin}` : "";
    return `${head}«${participant.verbatimValue}»${unit}${numeric}${originBit} — الموقع: ${verbatimLocator(participant)}`;
  }
  const head = source ? `${source}: ` : "";
  const originBit = origin ? ` — ${origin}` : "";
  return `${head}"${participant.verbatimValue}"${unit}${numeric}${originBit} — locator: ${verbatimLocator(participant)}`;
}

/**
 * Renders the finding statement.
 *
 * `subjectLabel` is the reviewers' handle for the subject. It is quoted
 * verbatim from the evidence when present; when it is absent the sentence says
 * so instead of inventing a name.
 */
export function renderFindingStatement(input: {
  findingKind: FindingKind;
  statementTemplateKey: string;
  participants: readonly FindingParticipant[];
  subjectLabel: string | null;
  sourceLabels?: ReadonlyMap<string, string>;
  locale: Locale;
}): RenderedFindingStatement {
  const { locale } = input;
  const ar = locale === "ar";
  const kindLabel = findingKindLabel(input.findingKind, locale);
  const subject = input.subjectLabel?.trim()
    ? (ar ? `الموضوع «${input.subjectLabel}»` : `subject "${input.subjectLabel}"`)
    : (ar ? "الموضوع غير مسمّى" : "the subject is unnamed");
  const participantLines = input.participants.map((participant) =>
    renderParticipantLine(participant, locale, input.sourceLabels?.get(participant.sourceArtifactId) ?? null),
  );

  const sides = participantLines.length
    ? participantLines.join(ar ? "  |  " : "  |  ")
    : (ar ? "لا توجد أدلة مسجّلة" : "no evidence participants are recorded");

  const heading = ar ? `فرق مسجّل: ${kindLabel}` : `recorded difference: ${kindLabel}`;
  const text = `${heading} — ${subject} — ${sides}`;

  return {
    locale,
    statementTemplateKey: input.statementTemplateKey,
    text,
    participantLines,
  };
}

/**
 * Bounded limitations for presentation.
 *
 * Arabic never receives the English limitation sentence: the localization
 * module's exact → pattern → generic-fallback chain is the only path.
 */
export function renderStatementLimitations(limitations: readonly string[], locale: Locale, max = 4): string[] {
  return limitations.slice(0, max).map((limitation) => localizeLimitation(limitation, locale));
}

/**
 * Forbidden review phrases.
 *
 * This list exists so a test can assert that no rendered statement, in either
 * language, ever contains winner language. It is a governance artifact, not a
 * filter: finding statements are generated from templates that cannot produce
 * these phrases in the first place.
 */
export const FORBIDDEN_STATEMENT_PHRASES: readonly string[] = [
  "correct quantity",
  "correct value",
  "should be",
  "actual quantity",
  "approved quantity",
  "approved unit",
  "winning",
  "winner",
  "preferred source",
  "preferred value",
  "takeoff quantity",
  "measured quantity",
  "counting",
  "الكمية الصحيحة",
  "القيمة الصحيحة",
  "يجب أن تكون",
  "الكمية الفعلية",
  "الكمية المعتمدة",
  "الوحدة المعتمدة",
  "المصدر المفضّل",
  "الفائز",
];

/** True when a rendered statement contains forbidden winner language. */
export function containsWinnerLanguage(text: string): boolean {
  const lowered = text.toLocaleLowerCase();
  return FORBIDDEN_STATEMENT_PHRASES.some((phrase) => lowered.includes(phrase.toLocaleLowerCase()));
}

/**
 * True when Arabic output leaked English prose.
 *
 * Technical source tokens (GlobalIds, model references, tags, property names,
 * locators, and the Latin document/format names VOKA uses) may legitimately
 * remain Latin, so the check looks for ENGLISH PROSE rather than any Latin
 * character.
 */
const ENGLISH_PROSE_MARKERS: readonly string[] = [
  "the ", " and ", " but ", " with ", " from ", "source", "document", "quantity", "unit", "locator",
];

export function containsEnglishProse(text: string): boolean {
  const lowered = text.toLocaleLowerCase();
  return ENGLISH_PROSE_MARKERS.some((marker) => lowered.includes(marker));
}
