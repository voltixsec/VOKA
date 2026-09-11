/**
 * Minimal PDF object model and lexer. Pure Node; no external PDF library.
 * Bounded by design: it never executes JavaScript, renders, or decodes images.
 */

export class PdfName { constructor(readonly name: string) {} }
export class PdfRef { constructor(readonly num: number, readonly gen: number) {} }
export class PdfString { constructor(readonly bytes: Buffer) {} }
export class PdfOperator { constructor(readonly op: string) {} }
export type PdfDict = Map<string, PdfValue>;
export class PdfStream { constructor(readonly dict: PdfDict, readonly raw: Buffer, readonly offset: number) {} }
export type PdfValue = null | boolean | number | PdfName | PdfRef | PdfString | PdfValue[] | PdfDict | PdfStream;

export type Token =
  | { kind: "num"; value: number; integer: boolean }
  | { kind: "name"; value: string }
  | { kind: "str"; value: Buffer }
  | { kind: "delim"; value: "[" | "]" | "<<" | ">>" | "{" | "}" }
  | { kind: "kw"; value: string }
  | { kind: "eof" };

const WS = new Uint8Array(256);
for (const code of [0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]) WS[code] = 1;
const DELIM = new Uint8Array(256);
for (const char of "()<>[]{}/%") DELIM[char.charCodeAt(0)] = 1;

export function isWhitespace(byte: number) { return WS[byte] === 1; }
export function isRegular(byte: number) { return WS[byte] !== 1 && DELIM[byte] !== 1; }
export function isDict(value: unknown): value is PdfDict { return value instanceof Map; }
export function nameOf(value: unknown): string | null { return value instanceof PdfName ? value.name : null; }
export function numberOf(value: unknown, fallback: number | null = null): number | null { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }

export type LengthResolver = (value: PdfValue) => number | null;

export class PdfLexer {
  pos: number;
  constructor(readonly buf: Buffer, pos = 0, readonly end = buf.length, private readonly resolveLength: LengthResolver | null = null) { this.pos = pos; }

  skipWhitespace() {
    while (this.pos < this.end) {
      const byte = this.buf[this.pos]!;
      if (WS[byte]) { this.pos++; continue; }
      if (byte === 0x25) { // % comment
        while (this.pos < this.end && this.buf[this.pos] !== 0x0a && this.buf[this.pos] !== 0x0d) this.pos++;
        continue;
      }
      break;
    }
  }

  readToken(): Token {
    this.skipWhitespace();
    if (this.pos >= this.end) return { kind: "eof" };
    const byte = this.buf[this.pos]!;
    if ((byte >= 0x30 && byte <= 0x39) || byte === 0x2b || byte === 0x2d || byte === 0x2e) return this.readNumber();
    if (byte === 0x2f) return this.readName();
    if (byte === 0x28) return { kind: "str", value: this.readLiteralString() };
    if (byte === 0x3c) {
      if (this.buf[this.pos + 1] === 0x3c) { this.pos += 2; return { kind: "delim", value: "<<" }; }
      return { kind: "str", value: this.readHexString() };
    }
    if (byte === 0x3e) {
      if (this.buf[this.pos + 1] === 0x3e) { this.pos += 2; return { kind: "delim", value: ">>" }; }
      this.pos++; return this.readToken(); // stray '>'
    }
    if (byte === 0x5b) { this.pos++; return { kind: "delim", value: "[" }; }
    if (byte === 0x5d) { this.pos++; return { kind: "delim", value: "]" }; }
    if (byte === 0x7b) { this.pos++; return { kind: "delim", value: "{" }; }
    if (byte === 0x7d) { this.pos++; return { kind: "delim", value: "}" }; }
    if (byte === 0x29) { this.pos++; return this.readToken(); } // stray ')'
    const start = this.pos;
    while (this.pos < this.end && isRegular(this.buf[this.pos]!)) this.pos++;
    if (this.pos === start) { this.pos++; return this.readToken(); }
    return { kind: "kw", value: this.buf.toString("latin1", start, this.pos) };
  }

  private readNumber(): Token {
    const start = this.pos;
    while (this.pos < this.end && isRegular(this.buf[this.pos]!)) this.pos++;
    const raw = this.buf.toString("latin1", start, this.pos);
    const cleaned = raw.replace(/[^0-9.+-]/gu, "").replace(/(?!^)[+-]/gu, "").replace(/^([+-]?)\.+/u, "$10.").replace(/(\.\d*)\./gu, "$1");
    const value = Number(cleaned);
    if (!Number.isFinite(value) || cleaned === "" || cleaned === "+" || cleaned === "-") {
      if (/^[0-9.+-]+$/u.test(raw)) return { kind: "num", value: 0, integer: true };
      return { kind: "kw", value: raw };
    }
    return { kind: "num", value, integer: Number.isInteger(value) && !raw.includes(".") };
  }

  private readName(): Token {
    this.pos++; // '/'
    let name = "";
    while (this.pos < this.end && isRegular(this.buf[this.pos]!)) {
      const byte = this.buf[this.pos]!;
      if (byte === 0x23 && this.pos + 2 < this.end) {
        const hex = this.buf.toString("latin1", this.pos + 1, this.pos + 3);
        if (/^[0-9a-f]{2}$/iu.test(hex)) { name += String.fromCharCode(parseInt(hex, 16)); this.pos += 3; continue; }
      }
      name += String.fromCharCode(byte);
      this.pos++;
    }
    return { kind: "name", value: name };
  }

  private readLiteralString(): Buffer {
    this.pos++; // '('
    const out: number[] = [];
    let depth = 1;
    while (this.pos < this.end) {
      const byte = this.buf[this.pos++]!;
      if (byte === 0x5c) { // backslash
        const next = this.buf[this.pos++];
        if (next === undefined) break;
        switch (next) {
          case 0x6e: out.push(0x0a); break; // n
          case 0x72: out.push(0x0d); break; // r
          case 0x74: out.push(0x09); break; // t
          case 0x62: out.push(0x08); break; // b
          case 0x66: out.push(0x0c); break; // f
          case 0x0d: if (this.buf[this.pos] === 0x0a) this.pos++; break; // line continuation
          case 0x0a: break;
          default:
            if (next >= 0x30 && next <= 0x37) {
              let octal = next - 0x30;
              for (let i = 0; i < 2 && this.pos < this.end; i++) {
                const digit = this.buf[this.pos]!;
                if (digit < 0x30 || digit > 0x37) break;
                octal = octal * 8 + (digit - 0x30);
                this.pos++;
              }
              out.push(octal & 0xff);
            } else out.push(next);
        }
        continue;
      }
      if (byte === 0x28) { depth++; out.push(byte); continue; }
      if (byte === 0x29) { depth--; if (depth === 0) break; out.push(byte); continue; }
      if (byte === 0x0d) { if (this.buf[this.pos] === 0x0a) this.pos++; out.push(0x0a); continue; }
      out.push(byte);
    }
    return Buffer.from(out);
  }

  private readHexString(): Buffer {
    this.pos++; // '<'
    const digits: number[] = [];
    while (this.pos < this.end) {
      const byte = this.buf[this.pos++]!;
      if (byte === 0x3e) break;
      if (byte >= 0x30 && byte <= 0x39) digits.push(byte - 0x30);
      else if (byte >= 0x41 && byte <= 0x46) digits.push(byte - 0x37);
      else if (byte >= 0x61 && byte <= 0x66) digits.push(byte - 0x57);
    }
    if (digits.length % 2 === 1) digits.push(0);
    const out = Buffer.alloc(digits.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = (digits[i * 2]! << 4) | digits[i * 2 + 1]!;
    return out;
  }

  /** Parses one object. Keywords that are not literals are returned as PdfOperator (content streams, `endobj`, etc.). */
  parseObject(depth = 0, allowStream = false): PdfValue | PdfOperator {
    const token = this.readToken();
    return this.parseFromToken(token, depth, allowStream);
  }

  private parseFromToken(token: Token, depth: number, allowStream: boolean): PdfValue | PdfOperator {
    if (depth > 64) return null;
    switch (token.kind) {
      case "eof": return new PdfOperator("");
      case "num": {
        if (token.integer && token.value >= 0) {
          const save = this.pos;
          const second = this.readToken();
          if (second.kind === "num" && second.integer && second.value >= 0) {
            const third = this.readToken();
            if (third.kind === "kw" && third.value === "R") return new PdfRef(token.value, second.value);
          }
          this.pos = save;
        }
        return token.value;
      }
      case "name": return new PdfName(token.value);
      case "str": return new PdfString(token.value);
      case "kw":
        if (token.value === "true") return true;
        if (token.value === "false") return false;
        if (token.value === "null") return null;
        return new PdfOperator(token.value);
      case "delim":
        if (token.value === "[") {
          const items: PdfValue[] = [];
          for (;;) {
            const next = this.readToken();
            if (next.kind === "eof" || (next.kind === "delim" && next.value === "]")) break;
            if (next.kind === "delim" && (next.value === ">>" || next.value === "}")) continue;
            if (next.kind === "kw" && /^(?:endobj|endstream|stream)$/u.test(next.value)) { this.pos -= next.value.length; break; }
            const value = this.parseFromToken(next, depth + 1, false);
            if (value instanceof PdfOperator) continue;
            items.push(value);
          }
          return items;
        }
        if (token.value === "<<") {
          const dict: PdfDict = new Map();
          for (;;) {
            const next = this.readToken();
            if (next.kind === "eof" || (next.kind === "delim" && next.value === ">>")) break;
            if (next.kind === "kw" && /^(?:endobj|endstream|stream)$/u.test(next.value)) { this.pos -= next.value.length; break; }
            if (next.kind !== "name") continue;
            const value = this.parseFromToken(this.readToken(), depth + 1, false);
            if (value instanceof PdfOperator) { if (value.op === "") break; continue; }
            dict.set(next.value, value);
          }
          if (allowStream) {
            const save = this.pos;
            const next = this.readToken();
            if (next.kind === "kw" && next.value === "stream") return this.readStream(dict);
            this.pos = save;
          }
          return dict;
        }
        return new PdfOperator(token.value);
    }
  }

  private readStream(dict: PdfDict): PdfStream {
    if (this.buf[this.pos] === 0x0d) this.pos++;
    if (this.buf[this.pos] === 0x0a) this.pos++;
    const start = this.pos;
    const declared = dict.get("Length");
    let length = typeof declared === "number" ? declared : this.resolveLength ? this.resolveLength(declared ?? null) : null;
    if (length !== null && (!Number.isInteger(length) || length < 0 || start + length > this.end || !this.endstreamFollows(start + length))) length = null;
    if (length === null) {
      const index = this.buf.indexOf("endstream", start, "latin1");
      let stop = index === -1 ? this.end : index;
      if (this.buf[stop - 1] === 0x0a) stop--;
      if (this.buf[stop - 1] === 0x0d) stop--;
      length = Math.max(0, stop - start);
    }
    const raw = this.buf.subarray(start, start + length);
    const marker = this.buf.indexOf("endstream", start + length, "latin1");
    this.pos = marker === -1 ? this.end : marker + "endstream".length;
    return new PdfStream(dict, raw, start);
  }

  private endstreamFollows(position: number) {
    let cursor = position;
    let skipped = 0;
    while (cursor < this.end && WS[this.buf[cursor]!] && skipped < 4) { cursor++; skipped++; }
    return this.buf.toString("latin1", cursor, cursor + 9) === "endstream";
  }
}

/** Decodes a PDF text string (UTF-16BE BOM, UTF-8 BOM, or PDFDocEncoding approximated as Latin-1). */
export function decodeTextString(value: PdfValue | undefined): string | null {
  if (!(value instanceof PdfString)) return null;
  const bytes = value.bytes;
  let text: string;
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) text = bytes.subarray(2).swap16().toString("utf16le");
  else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) text = bytes.subarray(3).toString("utf8");
  else text = bytes.toString("latin1");
  const cleaned = text.replace(/[\u0000-\u0008\u000b\u000e-\u001f]/gu, "").trim();
  return cleaned || null;
}

export function utf16beToString(bytes: Buffer) {
  if (bytes.length % 2 === 1) bytes = Buffer.concat([bytes, Buffer.from([0])]);
  return Buffer.from(bytes).swap16().toString("utf16le");
}
