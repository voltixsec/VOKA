/**
 * Compact encoding tables for simple fonts and a bounded glyph-name → Unicode list.
 * Unknown glyph names resolve to null so callers can count undecodable glyphs honestly.
 */

const ASCII_NAMES = "space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde".split(" ");

const LATIN1_NAMES = "nbspace exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot sfthyphen registered macron degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis".split(" ");

const EXTRA_GLYPHS: Record<string, number> = {
  quoteright: 0x2019, quoteleft: 0x2018, quotedblleft: 0x201c, quotedblright: 0x201d, quotesinglbase: 0x201a, quotedblbase: 0x201e,
  endash: 0x2013, emdash: 0x2014, bullet: 0x2022, ellipsis: 0x2026, dagger: 0x2020, daggerdbl: 0x2021, perthousand: 0x2030,
  guilsinglleft: 0x2039, guilsinglright: 0x203a, fraction: 0x2044, florin: 0x0192, trademark: 0x2122, Euro: 0x20ac, minus: 0x2212,
  fi: 0xfb01, fl: 0xfb02, ff: 0xfb00, ffi: 0xfb03, ffl: 0xfb04, dotlessi: 0x0131, Lslash: 0x0141, lslash: 0x0142, OE: 0x0152, oe: 0x0153,
  Scaron: 0x0160, scaron: 0x0161, Zcaron: 0x017d, zcaron: 0x017e, Ydieresis: 0x0178, circumflex: 0x02c6, tilde: 0x02dc, caron: 0x02c7,
  breve: 0x02d8, dotaccent: 0x02d9, ring: 0x02da, ogonek: 0x02db, hungarumlaut: 0x02dd, sfthyphen: 0x00ad, nbspace: 0x00a0, middot: 0x00b7,
  Omega: 0x03a9, Delta: 0x2206, pi: 0x03c0, summation: 0x2211, product: 0x220f, radical: 0x221a, infinity: 0x221e, integral: 0x222b,
  notequal: 0x2260, lessequal: 0x2264, greaterequal: 0x2265, approxequal: 0x2248, partialdiff: 0x2202, lozenge: 0x25ca, apple: 0xf8ff,
  degree: 0x00b0, diameter: 0x2300, Ohm: 0x2126, micro: 0x00b5, checkmark: 0x2713, arrowright: 0x2192, arrowleft: 0x2190, arrowup: 0x2191, arrowdown: 0x2193,
  // Arabic (Adobe Glyph List afii names) — Arabic is first-class in VOKA.
  afii57388: 0x060c, afii57403: 0x061b, afii57407: 0x061f, afii57409: 0x0621, afii57410: 0x0622, afii57411: 0x0623, afii57412: 0x0624,
  afii57413: 0x0625, afii57414: 0x0626, afii57415: 0x0627, afii57416: 0x0628, afii57417: 0x0629, afii57418: 0x062a, afii57419: 0x062b,
  afii57420: 0x062c, afii57421: 0x062d, afii57422: 0x062e, afii57423: 0x062f, afii57424: 0x0630, afii57425: 0x0631, afii57426: 0x0632,
  afii57427: 0x0633, afii57428: 0x0634, afii57429: 0x0635, afii57430: 0x0636, afii57431: 0x0637, afii57432: 0x0638, afii57433: 0x0639,
  afii57434: 0x063a, afii57440: 0x0640, afii57441: 0x0641, afii57442: 0x0642, afii57443: 0x0643, afii57444: 0x0644, afii57445: 0x0645,
  afii57446: 0x0646, afii57470: 0x0647, afii57448: 0x0648, afii57449: 0x0649, afii57450: 0x064a, afii57451: 0x064b, afii57452: 0x064c,
  afii57453: 0x064d, afii57454: 0x064e, afii57455: 0x064f, afii57456: 0x0650, afii57457: 0x0651, afii57458: 0x0652,
  afii57392: 0x0660, afii57393: 0x0661, afii57394: 0x0662, afii57395: 0x0663, afii57396: 0x0664, afii57397: 0x0665, afii57398: 0x0666,
  afii57399: 0x0667, afii57400: 0x0668, afii57401: 0x0669, afii57381: 0x066a, afii63167: 0x066d, afii57511: 0x0679, afii57506: 0x067e,
  afii57507: 0x0686, afii57508: 0x0698, afii57505: 0x06a4, afii57509: 0x06af, afii57514: 0x06ba, afii57519: 0x06d2, afii57534: 0x06d5,
};

const GLYPHS = new Map<string, number>();
for (const [name, code] of Object.entries(EXTRA_GLYPHS)) GLYPHS.set(name, code);
LATIN1_NAMES.forEach((name, index) => GLYPHS.set(name, 160 + index));
// ASCII names win over any alias above so "space"/"hyphen" never drift to NBSP/soft hyphen.
ASCII_NAMES.forEach((name, index) => GLYPHS.set(name, 32 + index));

export function glyphNameToUnicode(name: string): string | null {
  const known = GLYPHS.get(name);
  if (known !== undefined) return String.fromCodePoint(known);
  const uni = name.match(/^uni([0-9A-F]{4})(?:[0-9A-F]{4})*$/u);
  if (uni) return String.fromCodePoint(parseInt(uni[1]!, 16));
  const u = name.match(/^u([0-9A-F]{4,6})$/u);
  if (u) { const code = parseInt(u[1]!, 16); return code <= 0x10ffff ? String.fromCodePoint(code) : null; }
  const stripped = name.replace(/\.(?:sc|alt|swash|fina|init|medi|isol|liga|oldstyle|tnum|lnum|pnum|sups|subs|numr|dnom|ss\d\d|salt|\d+)$/u, "");
  if (stripped !== name) return glyphNameToUnicode(stripped);
  if (/^(?:g|G|glyph|cid|c|C|index|char)\d+$/u.test(name)) return null;
  if (name.length === 1) return name;
  return null;
}

function tableFromNames(names: Array<string | null>, offset: number) {
  const table = new Array<string | null>(256).fill(null);
  names.forEach((name, index) => { table[offset + index] = name; });
  return table;
}

const STANDARD_HIGH: Record<number, string> = {
  161: "exclamdown", 162: "cent", 163: "sterling", 164: "fraction", 165: "yen", 166: "florin", 167: "section", 168: "currency", 169: "quotesingle",
  170: "quotedblleft", 171: "guillemotleft", 172: "guilsinglleft", 173: "guilsinglright", 174: "fi", 175: "fl", 177: "endash", 178: "dagger",
  179: "daggerdbl", 180: "periodcentered", 182: "paragraph", 183: "bullet", 184: "quotesinglbase", 185: "quotedblbase", 186: "quotedblright",
  187: "guillemotright", 188: "ellipsis", 189: "perthousand", 191: "questiondown", 193: "grave", 194: "acute", 195: "circumflex", 196: "tilde",
  197: "macron", 198: "breve", 199: "dotaccent", 200: "dieresis", 202: "ring", 203: "cedilla", 205: "hungarumlaut", 206: "ogonek", 207: "caron",
  208: "emdash", 225: "AE", 227: "ordfeminine", 232: "Lslash", 233: "Oslash", 234: "OE", 235: "ordmasculine", 241: "ae", 245: "dotlessi",
  248: "lslash", 249: "oslash", 250: "oe", 251: "germandbls",
};
const WIN_ANSI_HIGH: Record<number, string> = {
  128: "Euro", 130: "quotesinglbase", 131: "florin", 132: "quotedblbase", 133: "ellipsis", 134: "dagger", 135: "daggerdbl", 136: "circumflex",
  137: "perthousand", 138: "Scaron", 139: "guilsinglleft", 140: "OE", 142: "Zcaron", 145: "quoteleft", 146: "quoteright", 147: "quotedblleft",
  148: "quotedblright", 149: "bullet", 150: "endash", 151: "emdash", 152: "tilde", 153: "trademark", 154: "scaron", 155: "guilsinglright",
  156: "oe", 158: "zcaron", 159: "Ydieresis", 160: "space", 173: "hyphen",
};
const MAC_ROMAN_HIGH = "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄¤‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ\uf8ffÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ";

export type EncodingTable = Array<string | null>; // code -> glyph name

export const STANDARD_ENCODING: EncodingTable = (() => {
  const table = tableFromNames(ASCII_NAMES, 32);
  table[39] = "quoteright"; table[96] = "quoteleft";
  for (const [code, name] of Object.entries(STANDARD_HIGH)) table[Number(code)] = name;
  return table;
})();

export const WIN_ANSI_ENCODING: EncodingTable = (() => {
  const table = tableFromNames(ASCII_NAMES, 32);
  for (let code = 160; code < 256; code++) table[code] = LATIN1_NAMES[code - 160]!;
  for (const [code, name] of Object.entries(WIN_ANSI_HIGH)) table[Number(code)] = name;
  for (let code = 127; code < 160; code++) if (!table[code]) table[code] = "bullet";
  return table;
})();

export const MAC_ROMAN_ENCODING: EncodingTable = (() => {
  const table = tableFromNames(ASCII_NAMES, 32);
  [...MAC_ROMAN_HIGH].forEach((char, index) => { table[128 + index] = `uni${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`; });
  return table;
})();

/** Symbolic fonts without a usable encoding still often carry ASCII-compatible codes; the caller decides whether to trust them. */
export function encodingByName(name: string | null): EncodingTable | null {
  switch (name) {
    case "WinAnsiEncoding": return WIN_ANSI_ENCODING;
    case "MacRomanEncoding": return MAC_ROMAN_ENCODING;
    case "StandardEncoding": case "MacExpertEncoding": return STANDARD_ENCODING;
    default: return null;
  }
}

// Advance widths (per 1000 em) for the standard 14 fonts, codes 32..126, derived from the Adobe AFM metrics.
const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 222, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 222, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELVETICA_BOLD = [278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 278, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const TIMES = [250, 333, 408, 500, 500, 833, 778, 333, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541];
const TIMES_BOLD = [250, 333, 555, 500, 500, 1000, 833, 333, 333, 333, 500, 570, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500, 930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778, 611, 778, 722, 556, 667, 722, 722, 1000, 722, 722, 667, 333, 278, 333, 581, 500, 333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500, 556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520];

export function standardFontWidth(baseFont: string | null, code: number): number | null {
  const name = (baseFont ?? "").replace(/^[A-Z]{6}\+/u, "");
  if (/courier|mono/iu.test(name)) return 600;
  if (code < 32 || code > 126) return null;
  const bold = /bold|black|heavy|semibold/iu.test(name);
  if (/times|serif|georgia|book/iu.test(name) && !/sans/iu.test(name)) return (bold ? TIMES_BOLD : TIMES)[code - 32] ?? null;
  if (/helvetica|arial|sans|verdana|calibri|segoe|tahoma|roboto|univers|frutiger|isocp|simplex|romans|txt/iu.test(name)) return (bold ? HELVETICA_BOLD : HELVETICA)[code - 32] ?? null;
  return (bold ? HELVETICA_BOLD : HELVETICA)[code - 32] ?? null;
}

export function isStandardFontName(baseFont: string | null) {
  return /^(?:[A-Z]{6}\+)?(?:Helvetica|Arial|Times|Courier|Symbol|ZapfDingbats)/u.test(baseFont ?? "");
}
