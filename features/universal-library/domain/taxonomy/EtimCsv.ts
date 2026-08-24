export function decodeEtimCsv(bytes: Buffer): string {
  const hasBom = bytes[0] === 0xff && bytes[1] === 0xfe;
  const isUtf16Le = hasBom || bytes[1] === 0;
  return isUtf16Le ? bytes.subarray(hasBom ? 2 : 0).toString("utf16le") : bytes.toString("utf8");
}

export function parseEtimCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (quoted && character === '"' && content[index + 1] === '"') { field += '"'; index++; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (!quoted && character === ";") { row.push(field); field = ""; continue; }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && content[index + 1] === "\n") index++;
      row.push(field); field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (quoted) throw new Error("ETIM CSV contains an unterminated quoted field.");
  return rows;
}
