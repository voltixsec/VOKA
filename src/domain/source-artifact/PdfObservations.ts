import type { ArtifactPage, ObservationOrigin, PageAttribution } from "./index";
import { assessPageTextReliability } from "./PdfClassification";

/**
 * Extraction of directly observed engineering/document facts from visible text.
 *
 * This layer sits above the low-level PDF parser and above the page model. It
 * reads `ArtifactPage.text` only, which is visible content-stream text plus
 * annotation text produced by the 2A-1A inspection.
 *
 * Hard rules:
 * - only text that is explicitly present is observed; nothing is completed,
 *   calculated, normalized into a product, approved, or verified;
 * - hidden/invisible text never becomes a confirmed observation;
 * - every observation keeps page provenance, and `pageNumber` stays null when
 *   page attribution was not proven;
 * - quantities are observed text, never approved commercial truth;
 * - supplier or manufacturer text is observed text, never supplier master data.
 */

export const OBSERVATION_TYPES = [
  "PROJECT_TITLE",
  "DOCUMENT_TITLE",
  "DRAWING_OR_SHEET_NUMBER",
  "REVISION",
  "DISCIPLINE",
  "SECTION_OR_DIVISION",
  "EQUIPMENT_TAG",
  "MODEL_OR_REFERENCE",
  "ITEM_NUMBER",
  "QUANTITY",
  "UNIT",
  "DESCRIPTION_OR_SPEC_TEXT",
] as const;

export type ObservationType = (typeof OBSERVATION_TYPES)[number] | import("./ImageVisual").VisualObservationType;

/**
 * Ordinal reliability of an observation: how explicit the source text was.
 * It is an engineering-review signal, not a probability.
 */
export type ObservationReliability = "HIGH" | "MEDIUM" | "LOW";

/**
 * Every observation is `OBSERVED_NOT_APPROVED`. There is no other value: the
 * field exists so a consumer cannot silently promote observed text into
 * approved engineering or commercial data.
 */
export const OBSERVATION_STATUS = "OBSERVED_NOT_APPROVED" as const;
export type ObservationStatus = typeof OBSERVATION_STATUS;

export type ObservationEvidence = {
  /**
   * Exact text fragment the observation was taken from, copied verbatim.
   * For visual observations this is the provider's bounded literal description
   * (not transcribed text), with `lineNumber: null` and an image locator.
   */
  snippet: string;
  /** Stable locator: "page 3, line 12", "unattributed page, line 12", or "image[, region]". */
  locator: string;
  lineNumber: number | null;
};

export type ObservedFact = {
  type: ObservationType;
  /** Verbatim observed text. Never normalized into a master-data value. */
  value: string;
  status: ObservationStatus;
  pageNumber: number | null;
  attribution: PageAttribution;
  reliability: ObservationReliability;
  evidence: ObservationEvidence;
  limitations: string[];
  /**
   * Which reading the observation was taken from. Absent for native readings
   * (legacy shape preserved); always present with `textSource: "OCR"` and the
   * engine identity for OCR-derived observations.
   */
  origin?: ObservationOrigin;
  /**
   * Which visual reading the observation was taken from. Present only for
   * 2A-3 visual observations, which never carry a text `origin`, so OCR/native
   * text and visual content stay separately attributed.
   */
  visualOrigin?: import("./ImageVisual").VisualOrigin;
};

export type PdfObservationResult = {
  observations: ObservedFact[];
  limitations: string[];
  truncated: boolean;
};

export const OBSERVATION_BASELINE_LIMITATIONS: readonly string[] = [
  "observations are copied from visible page text only; they are not approved engineering data, not a bill of materials, and not supplier master data",
  "no quantity was calculated, completed, or approved; quantities are observed text only",
  "no OCR, image interpretation, or geometry interpretation was performed",
];

export const MAX_OBSERVATIONS_PER_PAGE = 60;
export const MAX_OBSERVATIONS = 400;
const MAX_SNIPPET = 240;
const MAX_VALUE = 200;

// ---------------------------------------------------------------------------
// Patterns. Each one requires an explicit textual label or an explicit,
// self-identifying token; nothing is inferred from layout or geometry.
// ---------------------------------------------------------------------------

const LABEL_SEPARATOR = "\\s*[:\\-–]\\s*";

const PROJECT_TITLE = new RegExp(`^project(?:\\s*(?:name|title))?${LABEL_SEPARATOR}(.+)$`, "iu");
const DOCUMENT_TITLE_LABEL = new RegExp(`^(?:document|drawing|sheet|report)?\\s*title${LABEL_SEPARATOR}(.+)$`, "iu");
const DOCUMENT_HEADING = /^(bill\s+of\s+quantities|schedule\s+of\s+quantities|schedule\s+of\s+(?:rates|prices|works)|method\s+statement|technical\s+specification|specification)$/iu;
const DRAWING_NUMBER = /\b(?:drawing|dwg)\s*(?:no|number|num|#)\s*[.:#]?\s*([A-Za-z0-9][A-Za-z0-9\-./]{0,31})/iu;
/**
 * Sheet markers need an explicit label (no./number/#/colon) or an "x of y" form.
 * A bare word after "sheet" (for example "sheet metal") is not a sheet number.
 */
const SHEET_NUMBER = /\bsheet\s*(?:(?:no|number|num|#)\s*[.:#]?\s*|[.:#]\s*|\s+)(\d{1,4}[A-Za-z]?|[A-Za-z]{1,3}-?\d{1,4}[A-Za-z]?)(?:\s*(?:of|\/)\s*\d+)?(?![A-Za-z0-9])/iu;
/**
 * Revisions are observed only when an explicit rev/revision marker is followed by
 * a revision-shaped value. A revision-schedule header such as "REV DATE" is
 * therefore not mistaken for a revision value.
 */
const REVISION = /\brev(?:ision)?\b\s*[:.#]?\s*(\d{1,3}[A-Za-z0-9]?|[A-Za-z]{1,2}\d{0,3})(?![A-Za-z0-9])/iu;
const DISCIPLINE_LABEL = new RegExp(`^discipline${LABEL_SEPARATOR}(.+)$`, "iu");
const DISCIPLINE_STANDALONE = /^(mechanical|electrical|plumbing|hvac|fire\s+fighting|fire\s+alarm|civil|architectural|structural|low\s+current|elv|public\s+health|infrastructure)$/iu;
const SECTION = /\b(?:specification\s+)?section\s*(?:no\.?|number)?\s*[:#]?\s*(\d{2}\s\d{2}(?:\s\d{2})?)\b/iu;
const DIVISION = /\bdivision\s*(?:no\.?|number)?\s*[:#]?\s*(\d{2})\b/iu;
const MODEL_OR_REFERENCE = [
  /\bmodel\s*(?:no\.?|number)?\s*[:#]\s*(\S{1,64})/iu,
  /\b(?:catalog(?:ue)?|part)\s*(?:no\.?|number)\s*[:#]\s*(\S{1,64})/iu,
  /\bref(?:erence)?\.?\s*(?:no\.?|number)?\s*[:#]\s*(\S{1,64})/iu,
  // "to BS 1387": a standard/code reference. Deliberately stops at the code digits so a
  // trailing quantity in the same line ("... to BS 1387 250 m") is never absorbed into it.
  /\bto\s+([A-Z]{2,6}\s?\d{2,5})\b/iu,
];
const STANDARD_REFERENCE_INDEX = 3;
const TAG_LABEL = new RegExp(`^(?:equipment\\s+)?tag(?:\\s*(?:no|number))?${LABEL_SEPARATOR}(.+)$`, "iu");
const TAG_TOKEN = /\b([A-Z]{2,6}-?\d{1,5}[A-Z]?)\b/gu;
const EQUIPMENT_PREFIXES = new Set([
  "AHU", "FAHU", "MAU", "FCU", "VAV", "CRAC", "CDU", "CHW", "CH", "CU", "CT", "EF", "SF", "KEF", "KAF",
  "P", "PMP", "PUMP", "FHR", "FHC", "FHCAB", "AH", "MCC", "SMDB", "DB", "SSB", "UPS", "GEN", "XF", "TX",
  "LCP", "MCP", "JB", "CP", "LT", "LTG", "SD", "VSD", "VFD", "FP", "JP", "HP", "LP", "TANK", "SP",
]);
const EQUIPMENT_KEYWORDS = /\b(?:pump|fan|chiller|air\s+handling|ahu|fcu|elevator|lift|escalator|transformer|generator|panel|board|tank|heater|cooler|valve|damper|diffuser|grille|sprinkler|camera|sensor|motor|compressor|boiler|dosing)\b/iu;
const ITEM_NUMBER = /^\s*(\d{1,4}(?:[.\-]\d{1,4})*)[.)]?\s+\S/u;
const UNIT_TOKENS = "nos?|no\\.?|each|ea|pcs?|pieces?|units?|sets?|lots?|m|m2|m²|m3|m³|sqm|cum|lm|kg|kgs|ton|tonne|tonnes|ltr|litre|l|bar|kw|hp";
const ROW_WITH_QTY = new RegExp(`^(.+?)\\s+(\\d[\\d,]*(?:\\.\\d+)?)\\s+(${UNIT_TOKENS})\\s*$`, "iu");
const QTY_LABEL = new RegExp(`^(?:qty|quantity)${LABEL_SEPARATOR}(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_TOKENS})?\\s*$`, "iu");
const UNIT_LABEL = new RegExp(`^unit${LABEL_SEPARATOR}(${UNIT_TOKENS})\\s*$`, "iu");
const NOTE_LINE = new RegExp(`^note${LABEL_SEPARATOR}(.+)$`, "iu");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RELIABILITY_RANK: Record<ObservationReliability, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function weaker(a: ObservationReliability, b: ObservationReliability): ObservationReliability {
  return RELIABILITY_RANK[a] >= RELIABILITY_RANK[b] ? a : b;
}

function flattenLine(line: string) {
  return line.replace(/\s*\|\s*/gu, " ").replace(/\s+/gu, " ").trim();
}

/** Clips to a bound and reports whether it had to clip, so truncation is never silent. */
function clip(value: string, max = MAX_VALUE): { text: string; clipped: boolean } {
  const trimmed = value.trim();
  return trimmed.length > max ? { text: `${trimmed.slice(0, max)}…`, clipped: true } : { text: trimmed, clipped: false };
}

/**
 * Extracts observed facts from inspected pages.
 */
export function extractObservations(pages: ArtifactPage[]): PdfObservationResult {
  const observations: ObservedFact[] = [];
  const limitations: string[] = [...OBSERVATION_BASELINE_LIMITATIONS];
  const seen = new Set<string>();
  let truncated = false;

  for (const page of pages) {
    // A page number is only claimable when the page tree proved the attribution.
    const pageNumber = page.attribution === "PAGE_TREE" ? page.pageNumber ?? null : null;
    const attribution: PageAttribution = page.attribution ?? "UNATTRIBUTED";
    // Phase 2A-2: OCR-derived readings are stamped so they can never
    // masquerade as native text. Native pages keep the legacy key shape.
    const origin: ObservationOrigin | undefined = page.textSource === "OCR"
      ? { textSource: "OCR", engineId: page.ocr?.engineId ?? null }
      : undefined;
    const textReliability = assessPageTextReliability(page);
    const pageReliability: ObservationReliability = textReliability.reliability;
    const pageLimitations = [...textReliability.limitations];

    if (page.metrics?.invisibleTextCharacters) {
      limitations.push(
        pageNumber === null
          ? "an unattributed page carries an invisible text layer; it is probably OCR output and was not used for observations"
          : `page ${pageNumber} carries an invisible text layer; it is probably OCR output and was not used for observations`,
      );
    }
    if (!page.text?.trim()) continue;

    let produced = 0;
    const push = (
      type: ObservationType,
      value: string,
      reliability: ObservationReliability,
      snippet: string,
      lineNumber: number | null,
      extraLimitations: string[] = [],
    ) => {
      const trimmedValue = value.trim();
      if (!trimmedValue) return;
      if (produced >= MAX_OBSERVATIONS_PER_PAGE) {
        truncated = true;
        return;
      }
      const key = `${type}|${trimmedValue}|${pageNumber}|${lineNumber}`;
      if (seen.has(key)) return;
      seen.add(key);
      const clippedValue = clip(trimmedValue);
      const clippedSnippet = clip(snippet, MAX_SNIPPET);
      const locator = pageNumber === null ? `unattributed page, line ${lineNumber ?? "?"}` : `page ${pageNumber}, line ${lineNumber ?? "?"}`;
      observations.push({
        type,
        value: clippedValue.text,
        status: OBSERVATION_STATUS,
        pageNumber,
        attribution,
        reliability: weaker(reliability, pageReliability),
        evidence: { snippet: clippedSnippet.text, locator, lineNumber },
        ...(origin ? { origin } : {}),
        limitations: [
          ...pageLimitations,
          ...extraLimitations,
          ...(clippedValue.clipped ? [`value was truncated to ${MAX_VALUE} characters`] : []),
          ...(clippedSnippet.clipped ? [`evidence snippet was truncated to ${MAX_SNIPPET} characters`] : []),
        ],
      });
      produced += 1;
    };

    const rawLines = page.text.split(/\r?\n/u);
    for (let index = 0; index < rawLines.length; index += 1) {
      const raw = rawLines[index] ?? "";
      const lineNumber = index + 1;
      const line = flattenLine(raw);
      if (!line) continue;
      const snippet = raw.trim();

      // PROJECT_TITLE / DOCUMENT_TITLE / DOCUMENT heading
      const projectTitle = line.match(PROJECT_TITLE);
      if (projectTitle?.[1]) push("PROJECT_TITLE", projectTitle[1], "HIGH", snippet, lineNumber);

      const documentTitle = line.match(DOCUMENT_TITLE_LABEL);
      if (documentTitle?.[1]) push("DOCUMENT_TITLE", documentTitle[1], "HIGH", snippet, lineNumber);
      else if (line.length <= 120 && DOCUMENT_HEADING.test(line)) {
        push("DOCUMENT_TITLE", line, "MEDIUM", snippet, lineNumber, ["value is a heading line, not a labelled title field"]);
      }

      // DRAWING_OR_SHEET_NUMBER
      const drawingNumber = line.match(DRAWING_NUMBER);
      if (drawingNumber?.[1]) push("DRAWING_OR_SHEET_NUMBER", drawingNumber[1], "HIGH", snippet, lineNumber);
      const sheetNumber = line.match(SHEET_NUMBER);
      if (sheetNumber?.[1]) {
        push("DRAWING_OR_SHEET_NUMBER", sheetNumber[1], "HIGH", snippet, lineNumber, ["sheet marker observed in text; the physical sheet order was not verified"]);
      }

      // REVISION
      const revision = line.match(REVISION);
      if (revision?.[1]) push("REVISION", revision[1], "HIGH", snippet, lineNumber);

      // DISCIPLINE
      const disciplineLabel = line.match(DISCIPLINE_LABEL);
      if (disciplineLabel?.[1]) push("DISCIPLINE", disciplineLabel[1], "HIGH", snippet, lineNumber);
      else if (line.length <= 40 && DISCIPLINE_STANDALONE.test(line)) {
        push("DISCIPLINE", line, "MEDIUM", snippet, lineNumber, ["discipline word observed without an explicit discipline field"]);
      }

      // SECTION_OR_DIVISION
      const section = line.match(SECTION);
      if (section?.[1]) push("SECTION_OR_DIVISION", section[1], "HIGH", snippet, lineNumber);
      const division = line.match(DIVISION);
      if (division?.[1]) push("SECTION_OR_DIVISION", `Division ${division[1]}`, "HIGH", snippet, lineNumber);

      // MODEL_OR_REFERENCE
      for (let patternIndex = 0; patternIndex < MODEL_OR_REFERENCE.length; patternIndex += 1) {
        const match = line.match(MODEL_OR_REFERENCE[patternIndex]!);
        if (!match?.[1]) continue;
        const isStandard = patternIndex === STANDARD_REFERENCE_INDEX;
        if (isStandard && !/^[A-Z0-9\s-]+$/u.test(match[1])) continue;
        push("MODEL_OR_REFERENCE", match[1], isStandard ? "MEDIUM" : "HIGH", snippet, lineNumber, isStandard ? ["standard/code reference observed in text; it was not matched against a standards library"] : []);
      }

      // EQUIPMENT_TAG
      const tagLabel = line.match(TAG_LABEL);
      if (tagLabel?.[1]) push("EQUIPMENT_TAG", tagLabel[1], "HIGH", snippet, lineNumber);
      for (const match of line.matchAll(TAG_TOKEN)) {
        const token = match[1] ?? "";
        const prefix = token.split("-")[0] ?? "";
        if (!EQUIPMENT_PREFIXES.has(prefix.toUpperCase()) && !EQUIPMENT_KEYWORDS.test(line)) continue;
        push("EQUIPMENT_TAG", token, tagLabel ? "HIGH" : "MEDIUM", snippet, lineNumber, ["tag-like code matched a text pattern in the source line; it is not linked to an equipment register"]);
      }

      // ITEM_NUMBER / QUANTITY / UNIT / DESCRIPTION_OR_SPEC_TEXT
      const quantityLabel = line.match(QTY_LABEL);
      if (quantityLabel) {
        push("QUANTITY", quantityLabel[1]!, "HIGH", snippet, lineNumber, ["quantity is observed text only; it was not calculated, verified, or approved"]);
        if (quantityLabel[2]) push("UNIT", quantityLabel[2], "HIGH", snippet, lineNumber);
      }
      const unitLabel = line.match(UNIT_LABEL);
      if (unitLabel?.[1]) push("UNIT", unitLabel[1], "HIGH", snippet, lineNumber);

      const row = line.match(ROW_WITH_QTY);
      if (row) {
        const [, description, quantity, unit] = row;
        push("QUANTITY", quantity!, "MEDIUM", snippet, lineNumber, [
          "quantity is observed text taken from a schedule row; it was not calculated, verified, or approved",
        ]);
        push("UNIT", unit!, "MEDIUM", snippet, lineNumber);
        const itemNumber = line.match(ITEM_NUMBER);
        if (itemNumber?.[1]) {
          push("ITEM_NUMBER", itemNumber[1], "MEDIUM", snippet, lineNumber);
          const cleaned = description!.replace(new RegExp(`^${itemNumber[1].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}[.)]?\\s*`, "u"), "");
          push("DESCRIPTION_OR_SPEC_TEXT", cleaned, "MEDIUM", snippet, lineNumber, [
            "description is the text between the observed item number and the observed quantity/unit; it was not normalized into a product",
          ]);
        }
      } else {
        const itemNumberOnly = line.match(ITEM_NUMBER);
        if (itemNumberOnly?.[1] && /\b(item|qty|unit|rate|amount|description)\b/iu.test(line)) {
          push("ITEM_NUMBER", itemNumberOnly[1], "MEDIUM", snippet, lineNumber);
        }
      }

      const note = line.match(NOTE_LINE);
      if (note?.[1]) push("DESCRIPTION_OR_SPEC_TEXT", note[1], "MEDIUM", snippet, lineNumber, ["note text copied from the source line; it is not a verified specification"]);
    }
  }

  const finalObservations = observations.slice(0, MAX_OBSERVATIONS);
  if (observations.length > MAX_OBSERVATIONS) truncated = true;
  if (truncated) limitations.push("observation extraction was truncated by safety limits; the document contains more observed text than is listed");

  return { observations: finalObservations, limitations, truncated };
}
