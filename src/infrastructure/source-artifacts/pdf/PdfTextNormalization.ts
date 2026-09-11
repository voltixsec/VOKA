/**
 * PDF content streams store glyphs in visual order. Arabic (and other RTL) runs
 * therefore appear reversed when read left-to-right. This module restores a
 * logical reading order for RTL runs inside a line. It is a deterministic text
 * normalization, not an engineering inference, and callers flag its use as a
 * limitation because a producer may already have emitted logical order.
 */

const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefe]/u;
const RTL_RUN = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefe][\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefe\s\d\u066b\u066c.,:/()\-]*[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefe]|[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefe]/gu;
const MIRRORED: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" };

export function containsRtl(text: string) { return RTL.test(text); }

function reverseRtlRun(run: string) {
  // Keep digit/Latin sequences internally ordered; reverse the order of tokens and the characters of RTL tokens.
  const tokens = run.match(/[0-9\u0660-\u0669\u06f0-\u06f9][0-9\u0660-\u0669\u06f0-\u06f9.,:/]*|[^0-9\u0660-\u0669\u06f0-\u06f9]+/gu) ?? [run];
  return tokens.reverse().map((token) => /^[0-9\u0660-\u0669\u06f0-\u06f9]/u.test(token) ? token : [...token].reverse().map((char) => MIRRORED[char] ?? char).join("")).join("");
}

/** Converts visual-order RTL runs in a line to logical order. Returns the same string when no RTL text is present. */
export function normalizeVisualRtlLine(line: string) {
  if (!RTL.test(line)) return line;
  const normalized = line.normalize("NFKC");
  return normalized.replace(RTL_RUN, (run) => reverseRtlRun(run));
}
