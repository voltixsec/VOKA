/**
 * Phase 2A-10: PDF native-text and OCR-text materializers.
 *
 * The adapter consumes the ACCEPTED 2A-1B / 2A-2 evidence shape (`ObservedFact`)
 * and decides explicitly:
 *
 * - which records become claims — explicit observations only;
 * - which records stay context — identity/heading observations become context
 *   claims that never compare as values;
 * - which records are matching only — equipment tags and item numbers, never
 *   values;
 * - which records are prohibited as quantities — everything that is not a
 *   stated quantity, because a drawing reading is not a quantity;
 * - what locator is preserved — the accepted `page N, line M` locator, kept
 *   verbatim, with the page number left NULL whenever attribution was not
 *   proven;
 * - what reliability applies — the observation's own reliability, never
 *   lowered because the engine parses a numeric literal later;
 * - which limitations propagate — the observation's own limitations plus the
 *   hidden-text and truncation caveats.
 *
 * Hard rules honored here:
 * - native and OCR readings are SEPARATE claim generations: an OCR observation
 *   materializes into a `PDF_OCR_TEXT` claim, a native one into
 *   `PDF_NATIVE_TEXT`, and the two are never silently merged;
 * - hidden PDF text is never materialized, because the accepted observation
 *   layer never exposed it as an observation;
 * - a page number is never invented: `pageNumber` stays null when attribution
 *   was not proven;
 * - a stated quantity keeps the source LITERAL. `valueNumber` stays null:
 *   a PDF that writes "24" stated a literal, not a number.
 */

import {
  canonicalSubjectKey,
  compactSubjectKey,
  MATERIALIZER_VERSIONS,
  CROSS_DOCUMENT_BOUNDS,
  type ClaimReliability,
  type NormalizedEvidenceClaim,
  type ReadingChannel,
} from "@/src/domain/cross-document";
import type { ArtifactPage, ObservedFact, ObservationReliability } from "@/src/domain/source-artifact";
import type { ArtifactLineageContext, MaterializedArtifact, SourceArtifactRef } from "../ports";
import { buildClaim, declaredUnit, materializationSummary, sortClaims, type ClaimDraftInput } from "./ClaimBuilder";

export const PDF_NATIVE_MATERIALIZER_VERSION = MATERIALIZER_VERSIONS.PDF_NATIVE_TEXT;
export const PDF_OCR_MATERIALIZER_VERSION = MATERIALIZER_VERSIONS.PDF_OCR_TEXT;

export type PdfMaterializationInput = {
  artifact: SourceArtifactRef;
  lineage: ArtifactLineageContext;
  materializationId: string;
  runId: string | null;
  createdAt: string;
  pages: readonly ArtifactPage[];
  observations: readonly ObservedFact[];
  documentLimitations: readonly string[];
  truncated: boolean;
  /** Bounded OCR engine provenance recorded by the accepted OCR pass. */
  ocrEngines: readonly string[];
  unavailable?: boolean;
};

const PDF_BASELINE_LIMITATIONS: readonly string[] = [
  "PDF evidence is copied from page text the accepted inspection exposed; nothing was calculated, completed, or approved",
  "commercial rate, amount, and currency values stay source-native commercial evidence and are never materialized as comparison claims",
];

const HIDDEN_TEXT_LIMITATION = "hidden or invisible PDF text was not materialized: the accepted inspection never exposed it as an observation";

/** Identity of one schedule row: an explicit tag, an explicit item number, or the row's own text. */
type RowIdentity = {
  namespace: ClaimDraftInput["subjectKeyNamespace"];
  keyValue: string;
  matchKey: string;
  label: string | null;
  basis: ClaimDraftInput["subjectKeyBasis"];
};

function rowKey(observation: ObservedFact): string {
  return `${observation.pageNumber ?? "unattributed"}\u0000${observation.evidence.lineNumber ?? "?"}\u0000${observation.evidence.locator}`;
}

/**
 * Chooses the row identity in a fixed precedence order.
 *
 * An explicit equipment tag wins, then an explicit item number, then the
 * description text, then the raw snippet. Nothing is guessed from formatting,
 * and a prefix is never used as identity.
 */
function rowIdentity(observations: readonly ObservedFact[], fallbackSnippet: string): RowIdentity {
  const tag = observations.find((item) => item.type === "EQUIPMENT_TAG");
  if (tag) return { namespace: "EQUIPMENT_TAG", keyValue: tag.value, matchKey: compactSubjectKey(tag.value), label: tag.value, basis: "SOURCE_IDENTIFIER" };
  const item = observations.find((item) => item.type === "ITEM_NUMBER");
  if (item) return { namespace: "ITEM_NUMBER", keyValue: item.value, matchKey: compactSubjectKey(item.value), label: item.value, basis: "SOURCE_IDENTIFIER" };
  const description = observations.find((item) => item.type === "DESCRIPTION_OR_SPEC_TEXT");
  if (description) {
    return { namespace: "TEXT_LABEL", keyValue: description.value, matchKey: canonicalSubjectKey(description.value), label: description.value, basis: "ENGINE_DERIVED_TEXT_KEY" };
  }
  return { namespace: "TEXT_LABEL", keyValue: fallbackSnippet, matchKey: canonicalSubjectKey(fallbackSnippet), label: null, basis: "ENGINE_DERIVED_TEXT_KEY" };
}

function reliabilityOf(value: ObservationReliability): ClaimReliability {
  return value;
}

/**
 * Materializes one PDF artifact's comparison evidence.
 *
 * Claims are bounded, de-duplicated by deterministic claim id, and sorted, so
 * the same artifact hash and materializer version reproduce the same set.
 */
export function materializePdfClaims(input: PdfMaterializationInput): MaterializedArtifact {
  const limitations: string[] = [...PDF_BASELINE_LIMITATIONS, ...input.documentLimitations];
  const truncationReasons: string[] = [];
  const byId = new Map<string, NormalizedEvidenceClaim>();
  const readingChannels = new Set<ReadingChannel>();
  let dropped = 0;

  const pagesWithHiddenText = input.pages.filter((page) => (page.metrics?.invisibleTextCharacters ?? 0) > 0).length;
  if (pagesWithHiddenText > 0) limitations.push(HIDDEN_TEXT_LIMITATION);
  if (input.truncated) {
    truncationReasons.push("the accepted PDF inspection was truncated by its own safety bounds, so absence of evidence from this source is not asserted");
  }

  const rows = new Map<string, ObservedFact[]>();
  for (const observation of input.observations) {
    const key = rowKey(observation);
    const list = rows.get(key) ?? [];
    list.push(observation);
    rows.set(key, list);
  }

  const push = (observation: ObservedFact, draft: Omit<ClaimDraftInput, "artifact" | "lineage" | "materializationId" | "runId" | "materializerVersion" | "createdAt" | "readingChannel" | "coverage" | "pageNumber">) => {
    if (byId.size >= CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact) {
      dropped += 1;
      return;
    }
    const channel: ReadingChannel = observation.origin?.textSource === "OCR" ? "PDF_OCR_TEXT" : "PDF_NATIVE_TEXT";
    readingChannels.add(channel);
    const claim = buildClaim({
      ...draft,
      artifact: input.artifact,
      lineage: input.lineage,
      materializationId: input.materializationId,
      runId: input.runId,
      readingChannel: channel,
      materializerVersion: channel === "PDF_OCR_TEXT" ? PDF_OCR_MATERIALIZER_VERSION : PDF_NATIVE_MATERIALIZER_VERSION,
      coverage: input.truncated ? "PARTIAL" : "COMPLETE",
      createdAt: input.createdAt,
      pageNumber: observation.pageNumber,
      limitations: [
        ...observation.limitations,
        ...(observation.origin?.textSource === "OCR"
          ? [`the reading came from OCR (engine ${observation.origin.engineId ?? "unknown"}); it is a separate channel from any native page text`]
          : []),
      ],
      sourceQualifiers: [
        ...(draft.sourceQualifiers ?? []),
        ...(observation.origin?.textSource === "OCR" ? ["OCR_READING"] : ["NATIVE_TEXT_READING"]),
      ],
    });
    byId.set(claim.claimId, claim);
  };

  for (const [key, group] of rows) {
    const first = group[0];
    if (!first) continue;
    const identity = rowIdentity(group, first.evidence.snippet);
    const unitObservation = group.find((item) => item.type === "UNIT");
    const unit = declaredUnit(unitObservation?.value ?? null);
    const revision = group.find((item) => item.type === "REVISION");
    const section = group.find((item) => item.type === "SECTION_OR_DIVISION");
    const quantityObservation = group.find((item) => item.type === "QUANTITY");

    const base = {
      subjectKeyNamespace: identity.namespace,
      subjectKeyValue: identity.keyValue,
      subjectMatchKey: identity.matchKey,
      subjectKeyBasis: identity.basis,
      subjectLabel: identity.label,
      locationKind: null,
      locationValue: null,
      systemValue: null,
      sectionValue: section?.value ?? null,
      qualifiers: [] as string[],
      sourceQualifiers: [] as string[],
      locator: first.evidence.locator,
      humanLocator: null,
      citationId: null,
      rawRecordKind: first.type,
      rawRecordId: key,
      confidence: null,
      evidenceDocumentFamilyKey: null,
      observedRevisionLabel: revision?.value ?? null,
      revisionContext: revision ? ("OBSERVED" as const) : undefined,
    };

    if (quantityObservation) {
      push(quantityObservation, {
        ...base,
        predicate: "STATED_QUANTITY",
        valueLiteral: quantityObservation.value,
        // A PDF states a literal. The engine may parse "24" ephemerally inside
        // the comparator; VOKA never persists it as source numeric truth.
        sourceSuppliedNumber: null,
        unit,
        quantityOrigin: "STATED",
        reliability: reliabilityOf(quantityObservation.reliability),
        limitations: [
          ...quantityObservation.limitations,
          "the quantity is a literal copied from the source text; no numeric view was persisted because the document stated text",
        ],
      });
    }

    // A unit declaration is published once per row, as disclosure evidence.
    if (unitObservation) {
      push(unitObservation, {
        ...base,
        predicate: "UNIT_DECLARATION",
        valueLiteral: unitObservation.value,
        unit: declaredUnit(unitObservation.value),
        quantityOrigin: null,
        reliability: reliabilityOf(unitObservation.reliability),
      });
    }

    for (const observation of group) {
      switch (observation.type) {
        case "QUANTITY":
        case "UNIT":
          break;
        case "EQUIPMENT_TAG":
          push(observation, { ...base, predicate: "EQUIPMENT_TAG", valueLiteral: observation.value, unit: null, quantityOrigin: null, reliability: reliabilityOf(observation.reliability) });
          break;
        case "ITEM_NUMBER":
          push(observation, { ...base, predicate: "ITEM_NUMBER", valueLiteral: observation.value, unit: null, quantityOrigin: null, reliability: reliabilityOf(observation.reliability) });
          break;
        case "MODEL_OR_REFERENCE":
          push(observation, { ...base, predicate: "MODEL_REFERENCE", valueLiteral: observation.value, unit: null, quantityOrigin: null, reliability: reliabilityOf(observation.reliability) });
          break;
        case "DESCRIPTION_OR_SPEC_TEXT":
          push(observation, { ...base, predicate: "DESCRIPTION_TEXT", valueLiteral: observation.value, unit: null, quantityOrigin: null, reliability: reliabilityOf(observation.reliability) });
          break;
        case "SECTION_OR_DIVISION":
          push(observation, { ...base, predicate: "SECTION_OR_DIVISION", valueLiteral: observation.value, unit: null, quantityOrigin: null, reliability: reliabilityOf(observation.reliability) });
          break;
        case "REVISION":
          push(observation, { ...base, predicate: "REVISION_LABEL", valueLiteral: observation.value, unit: null, quantityOrigin: null, reliability: reliabilityOf(observation.reliability) });
          break;
        case "DRAWING_OR_SHEET_NUMBER":
          push(observation, {
            ...base,
            subjectKeyNamespace: "DRAWING_SHEET",
            subjectKeyValue: observation.value,
            subjectMatchKey: compactSubjectKey(observation.value),
            subjectKeyBasis: "SOURCE_IDENTIFIER",
            predicate: "DOCUMENT_IDENTITY",
            valueLiteral: observation.value,
            unit: null,
            quantityOrigin: null,
            reliability: reliabilityOf(observation.reliability),
          });
          break;
        case "DOCUMENT_TITLE":
        case "PROJECT_TITLE":
          push(observation, {
            ...base,
            subjectKeyNamespace: "DOCUMENT_IDENTITY",
            subjectKeyValue: observation.value,
            subjectMatchKey: canonicalSubjectKey(observation.value),
            subjectKeyBasis: "SOURCE_LABEL",
            predicate: "DOCUMENT_IDENTITY",
            valueLiteral: observation.value,
            unit: null,
            quantityOrigin: null,
            reliability: reliabilityOf(observation.reliability),
          });
          break;
        case "DISCIPLINE":
          push(observation, {
            ...base,
            subjectKeyNamespace: "DOCUMENT_IDENTITY",
            subjectKeyValue: observation.value,
            subjectMatchKey: canonicalSubjectKey(observation.value),
            subjectKeyBasis: "SOURCE_LABEL",
            predicate: "PROPERTY_VALUE",
            valueLiteral: observation.value,
            unit: null,
            quantityOrigin: null,
            reliability: reliabilityOf(observation.reliability),
          });
          break;
        default:
          push(observation, { ...base, predicate: "PROPERTY_VALUE", valueLiteral: observation.value, unit: null, quantityOrigin: null, reliability: reliabilityOf(observation.reliability) });
          break;
      }
    }
  }

  if (dropped > 0) {
    truncationReasons.push(`only ${CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact} of the PDF evidence records were materialized; the remainder exceeded the materialization bound`);
  }

  const claims = sortClaims([...byId.values()]);
  const summary = materializationSummary({ claims, truncated: input.truncated || dropped > 0, truncationReasons, warnings: [], limitations });
  return {
    artifact: input.artifact,
    lineage: input.lineage,
    materializationId: input.materializationId,
    materializerVersion: input.ocrEngines.length ? `${PDF_NATIVE_MATERIALIZER_VERSION}+${PDF_OCR_MATERIALIZER_VERSION}` : PDF_NATIVE_MATERIALIZER_VERSION,
    readingChannels: [...readingChannels].sort(),
    coverage: input.unavailable ? "PARTIAL" : summary.coverage,
    claims,
    truncated: summary.truncated,
    truncationReasons: summary.truncationReasons,
    warnings: summary.warnings,
    limitations: summary.limitations,
    unavailable: input.unavailable ?? false,
  };
}
