/**
 * Phase 2A-10: XLSX / structured BOQ materializer.
 *
 * It consumes the ACCEPTED 2A-6 `BoqLineCandidate` shape and explicitly decides:
 *
 * - claims come from observed structured line candidates and their merged
 *   header / section context, never from a reflection over arbitrary cells;
 * - `quantityNumber` is persisted because the accepted workbook model SUPPLIED
 *   it (`BoqLineCandidate.quantityNumber`). That is the only reason it is
 *   allowed to exist on a claim;
 * - a formula-backed value keeps the workbook's own cached result, is marked
 *   `FORMULA_BACKED`, and is excluded from the strict stated-vs-stated numeric
 *   comparison. VOKA never evaluates the formula and never validates
 *   qty × rate = amount;
 * - sheet, cell, and range locators are preserved verbatim; `pageNumber` is
 *   always null because a workbook has no page;
 * - hidden rows, hidden columns, hidden sheets, and merged-header inheritance
 *   are carried as source qualifiers and limitations, never presented as
 *   equivalent to visible content;
 * - RATE, AMOUNT, and CURRENCY are NEVER materialized: they remain
 *   source-native commercial evidence, so no rate/amount/currency mismatch can
 *   ever exist in this phase.
 */

import {
  MATERIALIZER_VERSIONS,
  CROSS_DOCUMENT_BOUNDS,
  canonicalSubjectKey,
  compactSubjectKey,
  type ClaimPredicate,
  type ClaimReliability,
  type NormalizedEvidenceClaim,
} from "@/src/domain/cross-document";
import {
  SPREADSHEET_BASELINE_LIMITATION,
  quoteSheetName,
  type BoqLineCandidate,
  type ObservationReliability,
  type SpreadsheetAnalysis,
  type SpreadsheetLiteral,
} from "@/src/domain/source-artifact";
import type { ArtifactLineageContext, MaterializedArtifact, SourceArtifactRef } from "../ports";
import { boundList, buildClaim, declaredUnit, materializationSummary, sortClaims, type ClaimDraftInput } from "./ClaimBuilder";

export const SPREADSHEET_MATERIALIZER_VERSION = MATERIALIZER_VERSIONS.WORKBOOK_STRUCTURED;

export type SpreadsheetMaterializationInput = {
  artifact: SourceArtifactRef;
  lineage: ArtifactLineageContext;
  materializationId: string;
  runId: string | null;
  createdAt: string;
  analysis: SpreadsheetAnalysis;
  unavailable?: boolean;
};

const WORKBOOK_LIMITATIONS: readonly string[] = [
  SPREADSHEET_BASELINE_LIMITATION,
  "commercial rate, amount, and currency values stay source-native commercial evidence and are never materialized as comparison claims",
];

/** Roles that are deliberately NOT published as comparison claims. */
export const PROHIBITED_XLSX_COLUMN_ROLES: readonly string[] = ["RATE", "AMOUNT"];

function literalValue(literal: SpreadsheetLiteral | null): string | null {
  if (!literal) return null;
  const display = literal.displayText.trim();
  if (display) return display;
  if (typeof literal.value === "string" && literal.value.trim()) return literal.value.trim();
  if (typeof literal.value === "number") return String(literal.value);
  if (typeof literal.cachedResult === "number") return String(literal.cachedResult);
  if (typeof literal.cachedResult === "string" && literal.cachedResult.trim()) return literal.cachedResult.trim();
  return null;
}

/** True when the accepted workbook model reported a formula-backed value for this literal. */
function isFormulaBacked(literal: SpreadsheetLiteral | null): boolean {
  if (!literal) return false;
  if (literal.formula && literal.formula.trim()) return true;
  return literal.type === "FORMULA" || literal.type === "FORMULA_RESULT";
}

function reliabilityOf(value: ObservationReliability): ClaimReliability {
  return value;
}

type RowSubject = {
  namespace: ClaimDraftInput["subjectKeyNamespace"];
  keyValue: string;
  matchKey: string;
  label: string | null;
  basis: ClaimDraftInput["subjectKeyBasis"];
};

/**
 * The row's comparison identity, in a fixed precedence order:
 * manufacturer + model (exactly what a manufacturer/model comparison needs),
 * then the item number, then the description text.
 */
function rowSubject(line: BoqLineCandidate): RowSubject {
  const manufacturer = literalValue(line.manufacturer);
  const brand = literalValue(line.brand);
  const model = literalValue(line.modelOrReference);
  const maker = manufacturer ?? brand;
  if (maker && model) {
    return {
      namespace: "MANUFACTURER_MODEL",
      keyValue: `${maker} ${model}`,
      matchKey: `${compactSubjectKey(maker)}|${compactSubjectKey(model)}`,
      label: literalValue(line.description) ?? `${maker} ${model}`,
      basis: "SOURCE_PROPERTY",
    };
  }
  const item = literalValue(line.itemNumber);
  if (item) {
    return { namespace: "ITEM_NUMBER", keyValue: item, matchKey: compactSubjectKey(item), label: literalValue(line.description), basis: "SOURCE_IDENTIFIER" };
  }
  const description = literalValue(line.description);
  if (description) {
    return { namespace: "TEXT_LABEL", keyValue: description, matchKey: canonicalSubjectKey(description), label: description, basis: "ENGINE_DERIVED_TEXT_KEY" };
  }
  return { namespace: "ARTIFACT_LOCATOR", keyValue: line.cellRef, matchKey: compactSubjectKey(line.cellRef), label: null, basis: "SOURCE_IDENTIFIER" };
}

/**
 * §11: the commercial columns are refused outright.
 *
 * The check is by column role, so a future workbook model that adds another
 * commercial role cannot sneak a rate, an amount, or a currency into a claim:
 * the caller asks this function before publishing, and `true` means prohibited.
 */
export function isProhibitedWorkbookColumnRole(role: string): boolean {
  return PROHIBITED_XLSX_COLUMN_ROLES.includes(role) || role === "CURRENCY";
}

/** True when the predicate itself would carry commercial semantics; none may. */
export function isProhibitedWorkbookPredicate(predicate: ClaimPredicate): boolean {
  return (["RATE", "AMOUNT", "CURRENCY", "PRICE", "COST"] as readonly string[]).includes(predicate);
}

export function materializeSpreadsheetClaims(input: SpreadsheetMaterializationInput): MaterializedArtifact {
  const limitations: string[] = [...WORKBOOK_LIMITATIONS, ...input.analysis.limitations];
  const truncationReasons: string[] = [];
  const byId = new Map<string, NormalizedEvidenceClaim>();
  let dropped = 0;

  if (input.analysis.truncated || input.analysis.workbook.truncated) {
    truncationReasons.push("the accepted workbook inspection was truncated by its own safety bounds, so absence of evidence from this source is not asserted");
  }
  if (input.analysis.workbook.hiddenSheetCount > 0) {
    limitations.push(`${input.analysis.workbook.hiddenSheetCount} hidden worksheet(s) were inspected; hidden content is not equivalent to visible user-facing content`);
  }

  const push = (line: BoqLineCandidate, draft: Omit<ClaimDraftInput, "artifact" | "lineage" | "materializationId" | "runId" | "materializerVersion" | "createdAt" | "readingChannel" | "coverage" | "pageNumber">) => {
    if (byId.size >= CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact) {
      dropped += 1;
      return;
    }
    const claim = buildClaim({
      ...draft,
      artifact: input.artifact,
      lineage: input.lineage,
      materializationId: input.materializationId,
      runId: input.runId,
      readingChannel: "WORKBOOK_STRUCTURED",
      materializerVersion: SPREADSHEET_MATERIALIZER_VERSION,
      coverage: input.analysis.truncated || input.analysis.workbook.truncated ? "PARTIAL" : "COMPLETE",
      createdAt: input.createdAt,
      pageNumber: null,
      limitations: line.limitations,
      sourceQualifiers: [
        ...(draft.sourceQualifiers ?? []),
        ...(line.hiddenRow ? ["HIDDEN_ROW"] : []),
        ...(line.hasFormula ? ["ROW_HAS_FORMULA"] : []),
      ],
    });
    byId.set(claim.claimId, claim);
  };

  for (const line of input.analysis.lines) {
    const subject = rowSubject(line);
    const unit = declaredUnit(literalValue(line.unit));
    const section = line.sectionContext;
    const common = {
      subjectKeyNamespace: subject.namespace,
      subjectKeyValue: subject.keyValue,
      subjectMatchKey: subject.matchKey,
      subjectKeyBasis: subject.basis,
      subjectLabel: subject.label,
      locationKind: "SHEET" as const,
      locationValue: line.sheetName,
      systemValue: null,
      sectionValue: section,
      qualifiers: line.regionId ? [`region ${line.regionId}`] : [],
      sourceQualifiers: [] as string[],
      locator: line.cellRef,
      humanLocator: `${quoteSheetName(line.sheetName)} row ${line.rowNumber}`,
      citationId: null,
      rawRecordKind: "BOQ_LINE_CANDIDATE",
      rawRecordId: line.id,
      confidence: null,
      evidenceDocumentFamilyKey: null,
      observedRevisionLabel: null,
      revisionContext: undefined,
    };

    const quantityLiteral = literalValue(line.quantity);
    const formulaBacked = isFormulaBacked(line.quantity);
    if (quantityLiteral) {
      push(line, {
        ...common,
        predicate: "STATED_QUANTITY",
        valueLiteral: quantityLiteral,
        // The accepted workbook model supplied this numeric view. It is the
        // ONLY reason a persisted number is allowed here.
        sourceSuppliedNumber: line.quantityNumber,
        unit,
        quantityOrigin: "STATED",
        reliability: reliabilityOf(line.reliability),
        sourceQualifiers: [
          ...(formulaBacked ? ["FORMULA_BACKED"] : []),
          ...(line.hiddenRow ? ["HIDDEN_ROW"] : []),
          ...(line.sectionContextRef ? ["INHERITED_SECTION_CONTEXT"] : []),
        ],
        limitations: [
          ...line.limitations,
          ...(line.quantityNumber !== null && !formulaBacked
            ? ["the numeric view was supplied by the workbook model itself; the literal it came from is preserved alongside it"]
            : []),
          ...(formulaBacked
            ? ["the quantity is formula-backed: VOKA preserved the workbook's cached result and never recalculated it, so it is excluded from the strict stated-versus-stated numeric comparison"]
            : []),
        ],
      });
    }

    if (literalValue(line.unit)) {
      push(line, {
        ...common,
        predicate: "UNIT_DECLARATION",
        valueLiteral: literalValue(line.unit)!,
        unit,
        quantityOrigin: null,
        reliability: reliabilityOf(line.reliability),
        limitations: [...line.limitations, "the unit is the workbook's own text; it was not converted and not resolved against a UOM master"],
      });
    }

    if (literalValue(line.itemNumber)) {
      push(line, { ...common, predicate: "ITEM_NUMBER", valueLiteral: literalValue(line.itemNumber)!, unit: null, quantityOrigin: null, reliability: reliabilityOf(line.reliability) });
    }

    const description = literalValue(line.description);
    if (description) {
      push(line, { ...common, predicate: "DESCRIPTION_TEXT", valueLiteral: description, unit: null, quantityOrigin: null, reliability: reliabilityOf(line.reliability) });
    }

    const manufacturer = literalValue(line.manufacturer);
    if (manufacturer) {
      push(line, { ...common, predicate: "MANUFACTURER", valueLiteral: manufacturer, unit: null, quantityOrigin: null, reliability: reliabilityOf(line.reliability) });
    }
    const brand = literalValue(line.brand);
    if (brand) {
      push(line, { ...common, predicate: "BRAND", valueLiteral: brand, unit: null, quantityOrigin: null, reliability: reliabilityOf(line.reliability) });
    }
    const model = literalValue(line.modelOrReference);
    if (model) {
      push(line, { ...common, predicate: "MODEL_REFERENCE", valueLiteral: model, unit: null, quantityOrigin: null, reliability: reliabilityOf(line.reliability) });
    }

    if (line.sectionContext) {
      push(line, {
        ...common,
        subjectKeyNamespace: "SECTION_DIVISION",
        subjectKeyValue: line.sectionContext,
        subjectMatchKey: canonicalSubjectKey(line.sectionContext),
        subjectKeyBasis: "SOURCE_LABEL",
        predicate: "SECTION_OR_DIVISION",
        valueLiteral: line.sectionContext,
        unit: null,
        quantityOrigin: null,
        reliability: reliabilityOf(line.reliability),
        limitations: [...line.limitations, "the section context was inherited from a heading row, not read from this item row"],
      });
    }

    // RATE / AMOUNT / REMARKS are deliberately NOT published. The remarks role
    // is free text that a reviewer reads in the workbook, and rate/amount are
    // commercial evidence outside this phase.
  }

  if (dropped > 0) {
    truncationReasons.push(`only ${CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact} workbook evidence records were materialized; the remainder exceeded the materialization bound`);
  }

  const claims = sortClaims([...byId.values()]);
  const summary = materializationSummary({
    claims,
    truncated: input.analysis.truncated || input.analysis.workbook.truncated || dropped > 0,
    truncationReasons,
    warnings: [],
    limitations: boundList(limitations, CROSS_DOCUMENT_BOUNDS.maxMaterializationLimitations),
  });
  return {
    artifact: input.artifact,
    lineage: input.lineage,
    materializationId: input.materializationId,
    materializerVersion: SPREADSHEET_MATERIALIZER_VERSION,
    readingChannels: ["WORKBOOK_STRUCTURED"],
    coverage: input.unavailable ? "PARTIAL" : summary.coverage,
    claims,
    truncated: summary.truncated,
    truncationReasons: summary.truncationReasons,
    warnings: summary.warnings,
    limitations: summary.limitations,
    unavailable: input.unavailable ?? false,
  };
}
