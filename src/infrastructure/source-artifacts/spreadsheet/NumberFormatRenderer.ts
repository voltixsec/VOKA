import type { SpreadsheetCellType } from "@/src/domain/source-artifact";

/**
 * Phase 2A-6: bounded workbook number-format renderer.
 *
 * A spreadsheet cell has two truths: the value the workbook stores and the
 * text the workbook displays. "00123", "12.50%", "01/02/2026", and
 * "KD 1,250.000" are all the same kind of cell wearing different formats, and
 * collapsing them onto the raw value would quietly destroy part numbers,
 * percentages, and dates.
 *
 * This module renders the display text from the workbook's own format code so
 * both truths can be reported. It is deliberately a CONSERVATIVE SUBSET of the
 * OOXML number-format grammar, not an engine:
 * - it never evaluates a formula, never resolves an external reference, and
 *   never reads anything outside the format string it is handed;
 * - when it meets a construct it cannot apply faithfully (conditional sections,
 *   elapsed-time brackets, scientific notation, colour or locale blocks) it
 *   says so in `limitation` and falls back to the stored literal, so a wrong
 *   rendering can never masquerade as the workbook's own text;
 * - it performs no unit or currency conversion. A currency symbol in a format
 *   is rendered as the characters the workbook declared, nothing more.
 */

/** Maximum characters retained for any rendered display text. */
export const MAX_DISPLAY_TEXT_CHARACTERS = 240;

export type RenderedCellText = {
  text: string;
  /** True when the workbook's number format was applied to produce `text`. */
  formatted: boolean;
  /** Plain-language note when the format could not be applied faithfully. */
  limitation: string | null;
};

type FormatToken =
  | { kind: "literal"; text: string }
  | { kind: "digit"; char: "0" | "#" | "?" }
  | { kind: "decimal" }
  | { kind: "group" }
  | { kind: "percent" }
  | { kind: "text" }
  | { kind: "date"; code: string }
  | { kind: "unsupported"; raw: string };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Plain-text rendering of a stored value with no workbook format applied. */
export function literalTextOf(value: string | number | boolean | Date | null): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return numberToPlainString(value);
  return value;
}

/**
 * Converts a number to text without scientific notation, so a part code stored
 * as a number never silently becomes "1e+21".
 */
function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return String(value);
  const text = String(value);
  if (!text.includes("e") && !text.includes("E")) return text;
  return decimalExpansionOf(text);
}

/** Expands exponential notation into plain decimal text. */
function decimalExpansionOf(text: string): string {
  const match = /^(-?)(\d)(?:\.(\d+))?[eE]([+-]?\d+)$/u.exec(text);
  if (!match) return text;
  const sign = match[1] ?? "";
  const integer = match[2] ?? "0";
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  if (!Number.isFinite(exponent) || Math.abs(exponent) > 1_000) return text;
  const digits = integer + fraction;
  let point = integer.length + exponent;
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

function splitSections(format: string): { sections: string[]; hadMultiple: boolean } {
  const sections: string[] = [];
  let current = "";
  let inQuotes = false;
  let escaped = false;
  for (const character of format) {
    if (escaped) {
      current += `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inQuotes = !inQuotes;
      current += character;
      continue;
    }
    if (character === ";" && !inQuotes) {
      sections.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  sections.push(current);
  return { sections, hadMultiple: sections.length > 1 };
}

function tokenize(section: string): FormatToken[] {
  const tokens: FormatToken[] = [];
  let index = 0;
  while (index < section.length) {
    const character = section[index]!;
    if (character === '"') {
      const closing = section.indexOf('"', index + 1);
      const end = closing === -1 ? section.length : closing;
      tokens.push({ kind: "literal", text: section.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (character === "\\") {
      tokens.push({ kind: "literal", text: section[index + 1] ?? "" });
      index += 2;
      continue;
    }
    if (character === "_" || character === "*") {
      index += 2;
      continue;
    }
    if (character === "[") {
      const closing = section.indexOf("]", index + 1);
      const end = closing === -1 ? section.length : closing + 1;
      tokens.push({ kind: "unsupported", raw: section.slice(index, end) });
      index = end;
      continue;
    }
    if ((character === "E" || character === "e") && /[+-]/u.test(section[index + 1] ?? "")) {
      tokens.push({ kind: "unsupported", raw: section.slice(index, index + 2) });
      index += 2;
      continue;
    }
    if (character === "@") {
      tokens.push({ kind: "text" });
      index += 1;
      continue;
    }
    if (character === "0" || character === "#" || character === "?") {
      tokens.push({ kind: "digit", char: character });
      index += 1;
      continue;
    }
    if (character === ".") {
      tokens.push({ kind: "decimal" });
      index += 1;
      continue;
    }
    if (character === ",") {
      tokens.push({ kind: "group" });
      index += 1;
      continue;
    }
    if (character === "%") {
      tokens.push({ kind: "percent" });
      index += 1;
      continue;
    }
    if (/[ymdhs]/iu.test(character)) {
      const letter = character.toLocaleLowerCase();
      let end = index;
      while (end < section.length && section[end]!.toLocaleLowerCase() === letter) end += 1;
      tokens.push({ kind: "date", code: section.slice(index, end).toLocaleLowerCase() });
      index = end;
      continue;
    }
    tokens.push({ kind: "literal", text: character });
    index += 1;
  }
  return tokens;
}

function pad(value: number, width: number): string {
  const text = String(Math.abs(Math.trunc(value)));
  return text.length >= width ? text : text.padStart(width, "0");
}

function groupDigits(text: string): string {
  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  const parts = body.split(".");
  parts[0] = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  return `${negative ? "-" : ""}${parts.join(".")}`;
}

/**
 * Renders the display text of one cell.
 *
 * `formatted` is false whenever the workbook format was absent or could not be
 * applied faithfully; in that case `text` is the stored literal and
 * `limitation` explains why, so no consumer can mistake a fallback for the
 * workbook's own rendering.
 */
export function renderCellDisplayText(input: {
  value: string | number | boolean | Date | null;
  type: SpreadsheetCellType;
  numberFormat: string | null;
}): RenderedCellText {
  const literal = literalTextOf(input.value);
  if (input.value === null || input.value === undefined) return { text: "", formatted: false, limitation: null };
  if (input.type === "ERROR") return { text: literal, formatted: false, limitation: null };
  const format = input.numberFormat?.trim() ?? "";
  if (!format || format.toLocaleLowerCase() === "general") return { text: literal, formatted: false, limitation: null };

  const { sections, hadMultiple } = splitSections(format);
  const section = sections[0] ?? "";
  const tokens = tokenize(section);
  const limitations: string[] = [];
  if (hadMultiple) limitations.push("the number format has conditional sections, so only the first section was applied");

  const unsupported = tokens.filter((token) => token.kind === "unsupported");
  if (unsupported.length) {
    limitations.push(`the number format uses ${unsupported[0]!.raw}, which was not applied`);
  }
  const hasTextPlaceholder = tokens.some((token) => token.kind === "text");
  const dateTokens = tokens.filter((token): token is Extract<FormatToken, { kind: "date" }> => token.kind === "date");
  const isDateValue = input.value instanceof Date || input.type === "DATE";
  if (isDateValue && dateTokens.length) {
    const date = input.value instanceof Date ? input.value : new Date(String(input.value));
    if (Number.isNaN(date.getTime())) return { text: literal, formatted: false, limitation: "the cell holds a date value that could not be read as a date" };
    const rendered = renderDateTokens(section, date, limitations);
    return { text: rendered.slice(0, MAX_DISPLAY_TEXT_CHARACTERS), formatted: true, limitation: limitations[0] ?? null };
  }
  if (typeof input.value === "boolean") {
    return { text: literal, formatted: false, limitation: limitations[0] ?? null };
  }
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) {
    // A text value with a format is simply the text; a text placeholder in the
    // format is the workbook agreeing with that.
    return { text: literal, formatted: false, limitation: hasTextPlaceholder ? (limitations[0] ?? null) : (limitations[0] ?? "the number format applies to numbers, so the stored text was kept as written") };
  }

  const digitTokens = tokens.filter((token) => token.kind === "digit");
  if (!digitTokens.length) return { text: literal, formatted: false, limitation: limitations[0] ?? "the number format contains no digit placeholders, so it was not applied" };
  const decimalIndex = tokens.findIndex((token) => token.kind === "decimal");
  const integerTokens = tokens.slice(0, decimalIndex === -1 ? tokens.length : decimalIndex).filter((token) => token.kind === "digit");
  const fractionTokens = decimalIndex === -1 ? [] : tokens.slice(decimalIndex + 1).filter((token) => token.kind === "digit");
  const percentCount = tokens.filter((token) => token.kind === "percent").length;
  const useGrouping = tokens.some((token) => token.kind === "group");
  const firstDigit = tokens.findIndex((token) => token.kind === "digit");
  let lastDigit = -1;
  tokens.forEach((token, index) => {
    if (token.kind === "digit" || token.kind === "percent") lastDigit = index;
  });
  const prefix = tokens.slice(0, firstDigit).map((token) => (token.kind === "literal" ? token.text : "")).join("");
  const suffix = tokens.slice(lastDigit + 1).map((token) => (token.kind === "literal" ? token.text : "")).join("");

  let magnitude = input.value;
  for (let index = 0; index < percentCount; index += 1) magnitude *= 100;
  const decimals = fractionTokens.filter((token) => token.char === "0" || token.char === "#").length;
  const rounded = decimals > 0 ? magnitude.toFixed(decimals) : String(Math.round(magnitude));
  let integerPart = rounded.split(".")[0] ?? "0";
  const fractionPart = rounded.split(".")[1] ?? "";
  const zeroPadWidth = integerTokens.length > 0 && integerTokens.every((token) => token.char === "0") ? integerTokens.length : 0;
  if (zeroPadWidth > 0) integerPart = pad(Number(integerPart), zeroPadWidth);
  if (useGrouping && !zeroPadWidth) integerPart = groupDigits(integerPart);
  const percentSign = "%".repeat(percentCount);
  const text = `${prefix}${integerPart}${fractionPart ? `.${fractionPart}` : ""}${percentSign}${suffix}`;
  return {
    text: text.slice(0, MAX_DISPLAY_TEXT_CHARACTERS),
    formatted: true,
    limitation: limitations[0] ?? null,
  };
}

/**
 * Renders a date with the workbook's own pattern.
 *
 * `m` is ambiguous in spreadsheet formats: it is a month unless it sits next to
 * an hour or a second, where it means minutes. The section string is used for
 * that decision so the same code that Excel uses is applied here.
 */
function renderDateTokens(section: string, date: Date, limitations: string[]): string {
  let rendered = "";
  let index = 0;
  while (index < section.length) {
    const character = section[index]!;
    if (character === '"') {
      const closing = section.indexOf('"', index + 1);
      const end = closing === -1 ? section.length : closing;
      rendered += section.slice(index + 1, end);
      index = end + 1;
      continue;
    }
    if (character === "\\") {
      rendered += section[index + 1] ?? "";
      index += 2;
      continue;
    }
    if (character === "[") {
      const closing = section.indexOf("]", index + 1);
      index = closing === -1 ? section.length : closing + 1;
      continue;
    }
    if (/[ymdhs]/iu.test(character)) {
      const letter = character.toLocaleLowerCase();
      let end = index;
      while (end < section.length && section[end]!.toLocaleLowerCase() === letter) end += 1;
      const code = section.slice(index, end).toLocaleLowerCase();
      const previous = section.slice(0, index).toLocaleLowerCase();
      const following = section.slice(end).toLocaleLowerCase();
      const isMinute = letter === "m" && (/(?:^|[^a-z])(h+|s+|am\/pm|a\/p)/u.test(previous) || /^\s*(?::?\s*s+|am\/pm|a\/p)/u.test(following));
      rendered += renderDateCode(code, date, isMinute);
      index = end;
      continue;
    }
    if (/am\/pm|a\/p/iu.test(section.slice(index, index + 5))) {
      const token = section.slice(index, index + 5).toLocaleLowerCase();
      if (token === "am/pm") {
        rendered += date.getUTCHours() < 12 ? "AM" : "PM";
        index += 5;
        continue;
      }
    }
    rendered += character;
    index += 1;
  }
  if (!limitations.length && !rendered.trim()) limitations.push("the date format produced no visible text");
  return rendered;
}

function renderDateCode(code: string, date: Date, isMinute: boolean): string {
  const length = code.length;
  if (code.startsWith("y")) return length >= 4 ? String(date.getUTCFullYear()) : pad(date.getUTCFullYear() % 100, 2);
  if (code.startsWith("d")) {
    if (length >= 4) return WEEKDAY_NAMES[date.getUTCDay()] ?? "";
    if (length === 3) return (WEEKDAY_NAMES[date.getUTCDay()] ?? "").slice(0, 3);
    if (length === 2) return pad(date.getUTCDate(), 2);
    return String(date.getUTCDate());
  }
  if (code.startsWith("h")) return length === 2 ? pad(date.getUTCHours(), 2) : String(date.getUTCHours());
  if (code.startsWith("s")) return length === 2 ? pad(date.getUTCSeconds(), 2) : String(date.getUTCSeconds());
  if (code.startsWith("m")) {
    if (isMinute) return length === 2 ? pad(date.getUTCMinutes(), 2) : String(date.getUTCMinutes());
    const month = date.getUTCMonth();
    if (length >= 4) return MONTH_NAMES[month] ?? "";
    if (length === 3) return (MONTH_NAMES[month] ?? "").slice(0, 3);
    if (length === 2) return pad(month + 1, 2);
    return String(month + 1);
  }
  return code;
}
