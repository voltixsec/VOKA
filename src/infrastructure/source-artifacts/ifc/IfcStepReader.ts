import {
  MAX_STEP_ENTITIES,
  MAX_STEP_NESTING_DEPTH,
  MAX_STEP_RECORD_LENGTH,
  MAX_RAW_STEP_TEXT,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-8: bounded STEP physical-file (ISO-10303-21) entity reader.
 *
 * IFC-SPF is a STEP file. The reader is confined to this folder. Nothing
 * outside it sees a parser class, a cursor, or a raw STEP value: the inspector
 * maps entities onto the domain evidence model.
 *
 * Deliberately not an IFC schema engine. It does not execute anything, does
 * not fetch references, and does not invent STEP ids. A handle that the file
 * omitted stays omitted.
 *
 * Record splitting never cuts on a semicolon that sits inside a quoted string
 * or a nested parenthesis list. That is the whole point of walking the text
 * rather than splitting naively.
 */

export type StepValue =
  | { kind: "null" }
  | { kind: "omitted" }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number; raw: string }
  | { kind: "enum"; value: string }
  | { kind: "logical"; value: true | false | null }
  | { kind: "ref"; id: number }
  | { kind: "list"; values: StepValue[] }
  | { kind: "typed"; type: string; value: StepValue }
  | { kind: "binary"; raw: string }
  | { kind: "unparsed"; raw: string };

export type StepEntity = {
  stepId: number;
  /** Uppercase entity type, e.g. IFCWALL. */
  entityType: string;
  /** Type as written. */
  rawType: string;
  args: StepValue[];
  /** Bounded raw STEP entity text, for provenance/debugging. */
  raw: string;
};

export type StepHeader = {
  description: string | null;
  fileName: string | null;
  timestamp: string | null;
  author: string | null;
  organization: string | null;
  preprocessor: string | null;
  originatingSystem: string | null;
  /** Exact FILE_SCHEMA identifiers, in file order. */
  schemas: string[];
};

export type StepReadLimits = {
  maxEntities: number;
  maxRecordLength: number;
  maxNestingDepth: number;
  maxRawText: number;
};

export const DEFAULT_STEP_READ_LIMITS: StepReadLimits = {
  maxEntities: MAX_STEP_ENTITIES,
  maxRecordLength: MAX_STEP_RECORD_LENGTH,
  maxNestingDepth: MAX_STEP_NESTING_DEPTH,
  maxRawText: MAX_RAW_STEP_TEXT,
};

export class IfcStepReadError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "IfcStepReadError";
  }
}

export type StepReadResult = {
  header: StepHeader;
  entities: StepEntity[];
  entityById: Map<number, StepEntity>;
  entityCount: number;
  truncated: boolean;
  sawIso: boolean;
  sawHeader: boolean;
  sawData: boolean;
  sawEndIso: boolean;
  limitations: string[];
};

function resolveLimits(limits: Partial<StepReadLimits> = {}): StepReadLimits {
  return { ...DEFAULT_STEP_READ_LIMITS, ...limits };
}

/** Skips STEP slash-star comments. STEP comments never nest. */
function skipComment(text: string, index: number): number {
  if (text[index] !== "/" || text[index + 1] !== "*") return index;
  const end = text.indexOf("*/", index + 2);
  return end < 0 ? text.length : end + 2;
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

function skipIgnorable(text: string, index: number): number {
  let i = index;
  while (i < text.length) {
    const ch = text[i]!;
    if (isWhitespace(ch)) {
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i = skipComment(text, i);
      continue;
    }
    break;
  }
  return i;
}

/**
 * Finds the matching end of a STEP string starting at the opening apostrophe.
 * Apostrophes inside a string are escaped by doubling them.
 */
function scanString(text: string, start: number): { end: number; value: string } {
  let i = start + 1;
  let value = "";
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "'") {
      if (text[i + 1] === "'") {
        value += "'";
        i += 2;
        continue;
      }
      return { end: i + 1, value };
    }
    value += ch;
    i += 1;
  }
  throw new IfcStepReadError("IFC_UNTERMINATED_STRING", "the IFC file contains an unterminated quoted string, so it is not a well-formed STEP file");
}

function scanUntil(text: string, start: number, stop: (ch: string, index: number, depth: number, inString: boolean) => boolean, maxDepth: number): { end: number; raw: string } {
  let i = start;
  let depth = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "'") {
        if (text[i + 1] === "'") {
          i += 2;
          continue;
        }
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i = skipComment(text, i);
      continue;
    }
    if (ch === "'") {
      inString = true;
      i += 1;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      if (depth > maxDepth) {
        throw new IfcStepReadError("IFC_NESTING_TOO_DEEP", `a STEP construct nested more than ${maxDepth} levels, so reading stopped`);
      }
    } else if (ch === ")") {
      depth -= 1;
    }
    if (stop(ch, i, depth, inString)) return { end: i, raw: text.slice(start, i) };
    i += 1;
  }
  return { end: i, raw: text.slice(start, i) };
}

function parseNumberToken(raw: string): StepValue {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "unparsed", raw };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { kind: "unparsed", raw: trimmed };
  return { kind: "number", value: parsed, raw: trimmed };
}

function parseValue(text: string, start: number, limits: StepReadLimits, depth: number): { value: StepValue; end: number } {
  if (depth > limits.maxNestingDepth) {
    throw new IfcStepReadError("IFC_NESTING_TOO_DEEP", `a STEP construct nested more than ${limits.maxNestingDepth} levels, so reading stopped`);
  }
  const i0 = skipIgnorable(text, start);
  if (i0 >= text.length) return { value: { kind: "unparsed", raw: "" }, end: i0 };
  const ch = text[i0]!;
  if (ch === "$") return { value: { kind: "null" }, end: i0 + 1 };
  if (ch === "*") return { value: { kind: "omitted" }, end: i0 + 1 };
  if (ch === "'") {
    const scanned = scanString(text, i0);
    return { value: { kind: "string", value: scanned.value }, end: scanned.end };
  }
  if (ch === "\"") {
    let i = i0 + 1;
    while (i < text.length && text[i] !== "\"") i += 1;
    const raw = text.slice(i0, i + 1);
    return { value: { kind: "binary", raw }, end: i < text.length ? i + 1 : i };
  }
  if (ch === "#") {
    let i = i0 + 1;
    while (i < text.length && /[0-9]/u.test(text[i]!)) i += 1;
    const id = Number.parseInt(text.slice(i0 + 1, i), 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new IfcStepReadError("IFC_MALFORMED_REFERENCE", "the IFC file contains a malformed entity reference");
    }
    return { value: { kind: "ref", id }, end: i };
  }
  if (ch === ".") {
    let i = i0 + 1;
    while (i < text.length && text[i] !== ".") i += 1;
    const token = text.slice(i0 + 1, i).toUpperCase();
    const end = i < text.length ? i + 1 : i;
    if (token === "T") return { value: { kind: "logical", value: true }, end };
    if (token === "F") return { value: { kind: "logical", value: false }, end };
    if (token === "U") return { value: { kind: "logical", value: null }, end };
    return { value: { kind: "enum", value: token }, end };
  }
  if (ch === "(") {
    const values: StepValue[] = [];
    let i = i0 + 1;
    i = skipIgnorable(text, i);
    if (text[i] === ")") return { value: { kind: "list", values }, end: i + 1 };
    while (i < text.length) {
      const parsed = parseValue(text, i, limits, depth + 1);
      values.push(parsed.value);
      i = skipIgnorable(text, parsed.end);
      const next = text[i];
      if (next === ",") {
        i += 1;
        continue;
      }
      if (next === ")") return { value: { kind: "list", values }, end: i + 1 };
      throw new IfcStepReadError("IFC_MALFORMED_LIST", "the IFC file contains a malformed STEP list");
    }
    throw new IfcStepReadError("IFC_UNTERMINATED_LIST", "the IFC file contains an unterminated STEP list");
  }
  if (/[A-Za-z]/u.test(ch)) {
    let i = i0;
    while (i < text.length && /[A-Za-z0-9_]/u.test(text[i]!)) i += 1;
    const type = text.slice(i0, i);
    const after = skipIgnorable(text, i);
    if (text[after] === "(") {
      const inner = parseValue(text, after, limits, depth + 1);
      if (inner.value.kind === "list") {
        const only = inner.value.values.length === 1 ? inner.value.values[0]! : inner.value;
        return { value: { kind: "typed", type: type.toUpperCase(), value: only }, end: inner.end };
      }
      return { value: { kind: "typed", type: type.toUpperCase(), value: inner.value }, end: inner.end };
    }
    return { value: { kind: "unparsed", raw: type }, end: i };
  }
  if (ch === "+" || ch === "-" || ch === "." || /[0-9]/u.test(ch)) {
    let i = i0;
    while (i < text.length && /[0-9.eE+-]/u.test(text[i]!)) i += 1;
    return { value: parseNumberToken(text.slice(i0, i)), end: i };
  }
  return { value: { kind: "unparsed", raw: ch }, end: i0 + 1 };
}

function parseArgumentList(text: string, openParen: number, limits: StepReadLimits): { args: StepValue[]; end: number } {
  if (text[openParen] !== "(") {
    throw new IfcStepReadError("IFC_MALFORMED_ENTITY", "a STEP entity is missing its argument list");
  }
  const list = parseValue(text, openParen, limits, 0);
  if (list.value.kind !== "list") {
    throw new IfcStepReadError("IFC_MALFORMED_ENTITY", "a STEP entity argument list could not be read");
  }
  return { args: list.value.values, end: list.end };
}

function parseHeaderCall(text: string, keyword: string): { args: StepValue[]; found: boolean } {
  const upper = text.toUpperCase();
  const key = `${keyword}(`;
  const at = upper.indexOf(key);
  if (at < 0) return { args: [], found: false };
  try {
    const parsed = parseArgumentList(text, at + keyword.length, DEFAULT_STEP_READ_LIMITS);
    return { args: parsed.args, found: true };
  } catch {
    return { args: [], found: true };
  }
}

function stringArg(value: StepValue | undefined): string | null {
  if (!value) return null;
  if (value.kind === "string") return value.value || null;
  if (value.kind === "list") {
    for (const inner of value.values) {
      const found = stringArg(inner);
      if (found) return found;
    }
    return null;
  }
  if (value.kind === "typed") return stringArg(value.value);
  return null;
}

function stringList(value: StepValue | undefined): string[] {
  if (!value) return [];
  if (value.kind === "string") return value.value ? [value.value] : [];
  if (value.kind === "list") return value.values.flatMap((inner) => stringList(inner));
  if (value.kind === "typed") return stringList(value.value);
  return [];
}

function parseHeader(headerText: string): StepHeader {
  const description = parseHeaderCall(headerText, "FILE_DESCRIPTION");
  const name = parseHeaderCall(headerText, "FILE_NAME");
  const schema = parseHeaderCall(headerText, "FILE_SCHEMA");
  const nameArgs = name.args;
  return {
    description: stringArg(description.args[0]),
    fileName: stringArg(nameArgs[0]),
    timestamp: stringArg(nameArgs[1]),
    author: stringList(nameArgs[2])[0] ?? null,
    organization: stringList(nameArgs[3])[0] ?? null,
    preprocessor: stringArg(nameArgs[4]),
    originatingSystem: stringArg(nameArgs[5]),
    schemas: stringList(schema.args[0]),
  };
}

/**
 * Reads a textual STEP physical file into bounded entity records.
 *
 * Throws `IfcStepReadError` when the file is not a well-formed STEP document
 * (unterminated strings, unbalanced lists, missing DATA section, etc.).
 * Truncation from safety caps is disclosed rather than thrown, so a huge but
 * well-formed model still produces reviewable evidence.
 */
export function readIfcStep(text: string, partialLimits: Partial<StepReadLimits> = {}): StepReadResult {
  const limits = resolveLimits(partialLimits);
  const upper = text.toUpperCase();
  const sawIso = upper.includes("ISO-10303-21");
  const headerStart = upper.indexOf("HEADER;");
  const headerEnd = upper.indexOf("ENDSEC;", headerStart >= 0 ? headerStart : 0);
  const dataStart = upper.indexOf("DATA;");
  let dataEnd = -1;
  if (dataStart >= 0) {
    dataEnd = upper.indexOf("ENDSEC;", dataStart + 5);
  }
  const sawEndIso = /END-ISO-10303-21/u.test(upper);

  if (!sawIso) {
    throw new IfcStepReadError("IFC_NOT_STEP", "the file is not a textual STEP/IFC physical file (ISO-10303-21 is missing)");
  }
  if (headerStart < 0) {
    throw new IfcStepReadError("IFC_MISSING_HEADER", "the STEP file has no HEADER section, so it is not a well-formed IFC file");
  }
  if (dataStart < 0) {
    throw new IfcStepReadError("IFC_MISSING_DATA", "the STEP file has no DATA section, so it is not a well-formed IFC file");
  }
  if (headerEnd < 0 || headerEnd > dataStart) {
    throw new IfcStepReadError("IFC_MALFORMED_HEADER", "the STEP HEADER section is not terminated before DATA");
  }
  if (dataEnd < 0) {
    throw new IfcStepReadError("IFC_MALFORMED_DATA", "the STEP DATA section is not terminated, so the file is not a well-formed IFC file");
  }

  const header = parseHeader(text.slice(headerStart, headerEnd));
  const data = text.slice(dataStart + 5, dataEnd);
  const entities: StepEntity[] = [];
  const entityById = new Map<number, StepEntity>();
  const limitations: string[] = [];
  let truncated = false;
  let i = 0;
  let scanned = 0;

  while (i < data.length) {
    i = skipIgnorable(data, i);
    if (i >= data.length) break;
    if (data[i] !== "#") {
      // Junk between records is a malformation unless it is only whitespace/comments,
      // which skipIgnorable already consumed.
      throw new IfcStepReadError("IFC_MALFORMED_DATA", "the STEP DATA section contains text that is not a STEP entity record");
    }
    const recordStart = i;
    let j = i + 1;
    while (j < data.length && /[0-9]/u.test(data[j]!)) j += 1;
    const stepId = Number.parseInt(data.slice(i + 1, j), 10);
    if (!Number.isInteger(stepId) || stepId <= 0) {
      throw new IfcStepReadError("IFC_MALFORMED_ENTITY", "a STEP entity id is missing or invalid");
    }
    j = skipIgnorable(data, j);
    if (data[j] !== "=") {
      throw new IfcStepReadError("IFC_MALFORMED_ENTITY", `STEP entity #${stepId} is missing '='`);
    }
    j = skipIgnorable(data, j + 1);
    const typeStart = j;
    while (j < data.length && /[A-Za-z0-9_]/u.test(data[j]!)) j += 1;
    const rawType = data.slice(typeStart, j);
    if (!rawType) {
      throw new IfcStepReadError("IFC_MALFORMED_ENTITY", `STEP entity #${stepId} has no type name`);
    }
    j = skipIgnorable(data, j);
    if (data[j] !== "(") {
      throw new IfcStepReadError("IFC_MALFORMED_ENTITY", `STEP entity #${stepId} (${rawType}) is missing its argument list`);
    }
    let parsed;
    try {
      parsed = parseArgumentList(data, j, limits);
    } catch (error) {
      if (error instanceof IfcStepReadError) throw error;
      throw new IfcStepReadError("IFC_MALFORMED_ENTITY", `STEP entity #${stepId} (${rawType}) could not be parsed`);
    }
    j = skipIgnorable(data, parsed.end);
    if (data[j] !== ";") {
      throw new IfcStepReadError("IFC_MALFORMED_ENTITY", `STEP entity #${stepId} (${rawType}) is not terminated with a semicolon`);
    }
    const recordEnd = j + 1;
    const rawFull = data.slice(recordStart, recordEnd);
    if (rawFull.length > limits.maxRecordLength) {
      truncated = true;
      limitations.push(`STEP entity #${stepId} exceeded the ${limits.maxRecordLength}-character record limit and was not retained`);
      i = recordEnd;
      scanned += 1;
      continue;
    }
    scanned += 1;
    if (entities.length >= limits.maxEntities) {
      truncated = true;
      i = recordEnd;
      continue;
    }
    const entity: StepEntity = {
      stepId,
      entityType: rawType.toUpperCase(),
      rawType,
      args: parsed.args,
      raw: rawFull.length > limits.maxRawText ? `${rawFull.slice(0, limits.maxRawText)}…` : rawFull,
    };
    entities.push(entity);
    entityById.set(stepId, entity);
    i = recordEnd;
  }

  if (truncated && scanned > entities.length) {
    limitations.push(`${scanned} STEP entities were read and ${entities.length} were retained; the difference is a bounded-inspection effect, not an equipment count`);
  }
  if (!sawEndIso) {
    limitations.push("the file did not end with END-ISO-10303-21, so it may be truncated or only partially written");
  }

  return {
    header,
    entities,
    entityById,
    entityCount: scanned,
    truncated,
    sawIso: true,
    sawHeader: true,
    sawData: true,
    sawEndIso,
    limitations,
  };
}

// ---------------------------------------------------------------------------
// STEP value helpers (no schema guessing)
// ---------------------------------------------------------------------------

export function unwrapStep(value: StepValue | undefined): StepValue | undefined {
  if (!value) return undefined;
  if (value.kind === "typed") return unwrapStep(value.value);
  return value;
}

export function stepAsString(value: StepValue | undefined): string | null {
  const inner = unwrapStep(value);
  if (!inner) return null;
  if (inner.kind === "string") return inner.value;
  if (inner.kind === "enum") return inner.value;
  if (inner.kind === "number") return inner.raw;
  if (inner.kind === "logical") return inner.value === null ? "UNKNOWN" : inner.value ? "true" : "false";
  return null;
}

export function stepAsNumber(value: StepValue | undefined): number | null {
  const inner = unwrapStep(value);
  if (!inner) return null;
  if (inner.kind === "number") return inner.value;
  if (inner.kind === "string") {
    const parsed = Number(inner.value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function stepAsRef(value: StepValue | undefined): number | null {
  const inner = unwrapStep(value);
  if (!inner) return null;
  if (inner.kind === "ref") return inner.id;
  return null;
}

export function stepAsRefList(value: StepValue | undefined): number[] {
  const inner = unwrapStep(value);
  if (!inner) return [];
  if (inner.kind === "ref") return [inner.id];
  if (inner.kind === "list") {
    const ids: number[] = [];
    for (const item of inner.values) {
      const id = stepAsRef(item);
      if (id !== null) ids.push(id);
    }
    return ids;
  }
  return [];
}

export function stepAsEnum(value: StepValue | undefined): string | null {
  const inner = unwrapStep(value);
  if (!inner) return null;
  if (inner.kind === "enum") return inner.value;
  return null;
}

export function stepAsList(value: StepValue | undefined): StepValue[] {
  const inner = unwrapStep(value);
  if (!inner) return [];
  if (inner.kind === "list") return inner.values;
  return [inner];
}

/** Literal rendering of a STEP value for property/quantity evidence. */
export function stepLiteral(value: StepValue | undefined): string | null {
  if (!value) return null;
  switch (value.kind) {
    case "null":
    case "omitted":
      return null;
    case "string":
      return value.value;
    case "number":
      return value.raw;
    case "enum":
      return value.value;
    case "logical":
      return value.value === null ? "UNKNOWN" : value.value ? "true" : "false";
    case "ref":
      return `#${value.id}`;
    case "binary":
      return value.raw;
    case "unparsed":
      return value.raw || null;
    case "typed": {
      const inner = stepLiteral(value.value);
      return inner;
    }
    case "list": {
      const parts = value.values.map((item) => stepLiteral(item)).filter((item): item is string => Boolean(item));
      return parts.length ? parts.join(", ") : null;
    }
    default:
      return null;
  }
}

export function stepTypedName(value: StepValue | undefined): string | null {
  if (!value) return null;
  if (value.kind === "typed") return value.type;
  return null;
}
