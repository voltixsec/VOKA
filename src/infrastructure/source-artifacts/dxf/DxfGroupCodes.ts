/**
 * Phase 2A-7: bounded ASCII DXF group-code reader.
 *
 * A DXF file is a flat sequence of two-line pairs — a group code, then its
 * value. That shape is the whole file format's substrate, so everything else in
 * this folder is built on this cursor rather than on regular expressions over
 * the whole text.
 *
 * Two properties are deliberate:
 *
 * - values stay strings. A group-40 radius arrives as `"25.0"` and is parsed to
 *   a number only at the point of use, so a malformed value stays visible
 *   instead of becoming NaN and disappearing;
 * - the cursor is bounded. A hostile or merely enormous drawing cannot make the
 *   reader walk forever: once `maxPairs` pairs have been read the cursor stops
 *   and reports truncation, which the inspector then discloses.
 */

export type DxfGroupCode = {
  code: number;
  /** Verbatim value line, trimmed of surrounding whitespace only. */
  value: string;
  /** Zero-based index of the code line, for diagnostics. */
  line: number;
};

/**
 * Group-code ranges AutoCAD defines as numeric. Everything else is text, and
 * the cursor keeps it as text.
 */
function isFloatCode(code: number): boolean {
  return (code >= 10 && code <= 59)
    || (code >= 110 && code <= 149)
    || (code >= 210 && code <= 239)
    || (code >= 460 && code <= 469)
    || (code >= 1010 && code <= 1059);
}

function isIntegerCode(code: number): boolean {
  return (code >= 60 && code <= 99)
    || (code >= 170 && code <= 179)
    || (code >= 270 && code <= 289)
    || (code >= 370 && code <= 389)
    || (code >= 400 && code <= 409)
    || (code >= 1060 && code <= 1071);
}

/**
 * Numeric view of a group value.
 *
 * Returns null rather than NaN when the value is not numeric, so a caller can
 * tell "the file stored zero" from "the file stored something unparseable" —
 * the second is a limitation worth keeping.
 */
export function numericGroupValue(code: number, value: string): number | null {
  if (!isFloatCode(code) && !isIntegerCode(code)) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export type DxfGroupCodeCursorOptions = {
  /** Hard cap on group-code pairs read from one file. */
  maxPairs: number;
};

export class DxfGroupCodeCursor {
  private readonly lines: string[];
  private position = 0;
  private pairsRead = 0;
  private limitReached = false;
  private eofMarkerSeen = false;

  constructor(text: string, private readonly options: DxfGroupCodeCursorOptions) {
    this.lines = text.split(/\r\n|\r|\n/);
  }

  /** True when the file's own `0`/`EOF` marker was reached. */
  get eof(): boolean {
    return this.eofMarkerSeen;
  }

  /** True when the pair cap stopped the read before the file ended. */
  get truncated(): boolean {
    return this.limitReached;
  }

  get pairs(): number {
    return this.pairsRead;
  }

  private at(index: number): DxfGroupCode | null {
    if (index + 1 >= this.lines.length + 1) return null;
    const codeLine = this.lines[index];
    const valueLine = this.lines[index + 1];
    if (codeLine === undefined) return null;
    const trimmedCode = codeLine.trim();
    if (!/^-?\d{1,4}$/u.test(trimmedCode)) return null;
    return { code: Number.parseInt(trimmedCode, 10), value: (valueLine ?? "").trim(), line: index };
  }

  hasNext(): boolean {
    if (this.eofMarkerSeen || this.limitReached) return false;
    return this.at(this.position) !== null;
  }

  /** Reads the next pair, or null at end of input or on a malformed pair. */
  next(): DxfGroupCode | null {
    if (this.eofMarkerSeen || this.limitReached) return null;
    const group = this.at(this.position);
    if (!group) return null;
    this.position += 2;
    this.pairsRead += 1;
    if (this.pairsRead >= this.options.maxPairs) this.limitReached = true;
    if (group.code === 0 && group.value.toUpperCase() === "EOF") this.eofMarkerSeen = true;
    return group;
  }

  /** Looks at the next pair without consuming it. */
  peek(): DxfGroupCode | null {
    if (this.eofMarkerSeen || this.limitReached) return null;
    return this.at(this.position);
  }

  /**
   * Reads pairs until the predicate matches the NEXT pair, leaving that pair
   * unconsumed. Returns the pairs read.
   */
  readUntil(predicate: (group: DxfGroupCode) => boolean): DxfGroupCode[] {
    const collected: DxfGroupCode[] = [];
    for (;;) {
      const upcoming = this.peek();
      if (!upcoming || predicate(upcoming)) return collected;
      const group = this.next();
      if (!group) return collected;
      collected.push(group);
    }
  }

  /** Reads pairs until the next `0` control pair, leaving it unconsumed. */
  readEntityBody(): DxfGroupCode[] {
    return this.readUntil((group) => group.code === 0);
  }
}
