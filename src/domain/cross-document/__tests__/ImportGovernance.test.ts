/**
 * Phase 2A-10 import governance.
 *
 * The cross-document engine is an evidence-reading subsystem: it may consume
 * accepted source-artifact evidence, and it may NOT reach a promotion lane.
 * There is no Requirement, no quantity approval, no takeoff line, no BOM, no
 * quotation line, no product selection, no supplier, no procurement request, no
 * RFQ, no offer, no award, and no purchase order anywhere in its dependency
 * graph — and this test proves it by reading the source, not by convention.
 *
 * It also proves the two invariants that are one keystroke away from being
 * broken in a schema edit: the prohibited finding families are absent from the
 * finding vocabulary, and no claim, finding, or review artefact carries an
 * approval-shaped column.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FINDING_KINDS, PROHIBITED_FINDING_KINDS } from "@/src/domain/cross-document";
import { CROSS_DOCUMENT_BOUNDS } from "@/src/domain/cross-document";

const ROOTS = [
  "src/domain/cross-document",
  "src/application/cross-document",
  "src/infrastructure/cross-document",
  "app/api/cross-document",
  "lib/cross-document",
];

/** Modules the cross-document engine must never import. */
const FORBIDDEN_IMPORT_FRAGMENTS: readonly string[] = [
  "quantity-approval",
  "QuantityApproval",
  "drawing-takeoff",
  "DrawingTakeoff",
  "EngineeringBom",
  "engineering-bom",
  "ProductSelection",
  "product-selection",
  "ProcurementRequirement",
  "procurement-requirement",
  "QuotationLine",
  "quotation-line",
  "Supplier",
  "supplier",
  "purchase-order",
  "PurchaseOrder",
  "RFQ",
  "Offer",
  "Award",
  "BoqCandidateParser",
  "requirements/",
  "/requirement",
];

/** Token shapes that would mean the engine started deciding, not reading. */
const FORBIDDEN_SOURCE_TOKENS: readonly string[] = [
  "approvedQuantity",
  "correctValue",
  "winningSide",
  "winningSource",
  "preferredSource",
  "resolvedQuantity",
  "takeoffQuantity",
  "authoritativeSource",
];

function sourceFilesIn(root: string): string[] {
  const out: string[] = [];
  const walk = (directory: string) => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry === "__tests__") continue;
        walk(path);
        continue;
      }
      if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
    }
  };
  walk(root);
  return out;
}

const files = ROOTS.flatMap((root) => sourceFilesIn(root).map((path) => ({ path, text: readFileSync(path, "utf8") })));

describe("cross-document import governance", () => {
  it("scans a real, non-empty 2A-10 surface", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((file) => file.path.includes("ComparisonRunService"))).toBe(true);
    expect(files.some((file) => file.path.includes("materialization"))).toBe(true);
  });

  it("never imports a promotion lane", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const importLines = file.text.split("\n").filter((line) => line.trimStart().startsWith("import ") || line.includes("require("));
      for (const line of importLines) {
        for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
          if (line.includes(fragment)) offenders.push(`${file.path}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never names an approval or winner token outside an explicit refusal", () => {
    // A negative declaration is the point ("recordsApprovedQuantity: false"), so
    // the check is not "the token is absent" but "the token is always negated,
    // null, forbidden, or listed as NOT exposed". Anything else is a decision
    // the engine is not allowed to make.
    const negations: RegExp[] = [/:\s*(null|false)\b/u, /\bnot exposed\b/iu, /\bnot a\b/u, /\bnever\b/u, /\bis owned by\b/u, /^\s*"[a-zA-Z]+",?\s*$/u, /^\s*(\/\/|\*|\/\*)/u, /FORBIDDEN/u, /PROHIBITED/u, /excluded/u, /notExposed/u];
    const offenders: string[] = [];
    for (const file of files) {
      file.text.split("\n").forEach((line, index) => {
        for (const token of FORBIDDEN_SOURCE_TOKENS) {
          if (!line.includes(token)) continue;
          if (negations.some((pattern) => pattern.test(line))) continue;
          offenders.push(`${file.path}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("has no rate, amount, or currency finding family", () => {
    expect(FINDING_KINDS).not.toContain("RATE_MISMATCH");
    expect(FINDING_KINDS).not.toContain("AMOUNT_MISMATCH");
    expect(FINDING_KINDS).not.toContain("CURRENCY_MISMATCH");
    expect([...PROHIBITED_FINDING_KINDS].sort()).toEqual(["AMOUNT_MISMATCH", "CURRENCY_MISMATCH", "RATE_MISMATCH"]);
  });

  it("keeps every bound in one policy module instead of inline in the engine", () => {
    expect(CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact).toBeGreaterThan(0);
    expect(CROSS_DOCUMENT_BOUNDS.maxClaimsPerScope).toBeGreaterThan(CROSS_DOCUMENT_BOUNDS.maxClaimsPerArtifact);
    const offenders = files
      .filter((file) => file.path.includes("computeComparison") || file.path.includes("SubjectMatchEngine"))
      .filter((file) => /\b[0-9]{4,}\b/u.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("cannot be bypassed by dynamic invocation, eval, or a string-built module path", () => {
    // The static import scan above is only meaningful if nothing in the engine
    // can reach a promotion lane at runtime by constructing a name. Dynamic
    // import, require, eval, new Function, and Reflect-based property access are
    // all refused in the cross-document surface.
    const offenders: string[] = [];
    const patterns: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\brequire\s*\(/u, label: "require()" },
      { pattern: /\beval\s*\(/u, label: "eval()" },
      { pattern: /\bnew\s+Function\s*\(/u, label: "new Function()" },
      { pattern: /\bFunction\s*\(\s*["'`]/u, label: "Function() from a string" },
      { pattern: /\bReflect\.(get|set|apply|construct)\s*\(/u, label: "Reflect property access" },
      { pattern: /\bglobalThis\s*\[/u, label: "globalThis bracket access" },
      { pattern: /\bprocess\.binding\s*\(/u, label: "process.binding()" },
    ];
    for (const file of files) {
      file.text.split("\n").forEach((line, index) => {
        const trimmed = line.trim();
        // A comment naming the guard is the guard, not a bypass.
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        // `import("./ports").DocumentRelationRecord` is a TypeScript type
        // annotation, erased at compile time. Only expression-position dynamic
        // import can load a module at runtime.
        const runtimeImport = /\bimport\s*\(\s*["'`][^"'`]*["'`]\s*\)(?!\s*\.)/u.test(line) || /\bawait\s+import\s*\(/u.test(line);
        if (runtimeImport) offenders.push(`${file.path}:${index + 1}: dynamic import() — ${trimmed}`);
        for (const { pattern, label } of patterns) {
          if (pattern.test(line)) offenders.push(`${file.path}:${index + 1}: ${label} — ${trimmed}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("publishes no commercial predicate, subject namespace, or claim type", () => {
    // Rates, amounts, currencies, prices, and FX are read by the accepted
    // workbook analyser only so they can be withheld. Nothing commercial may
    // become a predicate, a subject namespace, or a finding kind.
    const commercial = /RATE|AMOUNT|CURRENCY|PRICE|\bFX\b|COMMERCIAL|COST/u;
    for (const kind of FINDING_KINDS) {
      expect(commercial.test(kind), `finding kind ${kind} is commercial`).toBe(false);
    }
    const offenders: string[] = [];
    for (const file of files) {
      file.text.split("\n").forEach((line, index) => {
        // A predicate/namespace declaration naming a commercial concept.
        if (!/^\s*(?:RATE|AMOUNT|CURRENCY|PRICE|FX)\s*[:,]/u.test(line)) return;
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        offenders.push(`${file.path}:${index + 1}: ${trimmed}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the 2A-9 derivation family rule intact: DERIVED_FROM is only refused here", () => {
    // 2A-9 `ArtifactDerivation` owns DERIVED_FROM. A 2A-10 document relation may
    // only mention it in order to refuse it, never to implement it.
    const guards = ["owned by Phase 2A-9", "not a 2A-10 document relation", "deliberately not a legal relation", "deliberately absent"];
    const offenders: string[] = [];
    for (const file of files) {
      let index = file.text.indexOf("DERIVED_FROM");
      while (index >= 0) {
        const window = file.text.slice(Math.max(0, index - 400), index + 400);
        if (!guards.some((guard) => window.includes(guard))) offenders.push(`${file.path}@${index}`);
        index = file.text.indexOf("DERIVED_FROM", index + 1);
      }
    }
    expect(offenders).toEqual([]);
  });
});
