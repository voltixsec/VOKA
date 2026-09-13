/**
 * Phase 2A-11 §9 — drawing-symbol occurrence governance.
 *
 * The task required a governed chain from 2A-10 drawing/vision evidence through
 * a human included/excluded decision to a COUNTED candidate, with two hard
 * prohibitions: no AI auto-approval of symbol occurrences, and no aggregate
 * count inferred from a vision summary.
 *
 * The audit found that 2A-10 deliberately retains no per-occurrence symbol
 * inventory, so a safe occurrence identity cannot be constructed. The truthful
 * response is a recorded capability blocker — the production occurrence source
 * supplies nothing rather than inventing symbols.
 *
 * These tests pin the BLOCKER so it cannot silently regress into fabricated
 * counts, and pin the GOVERNED MACHINERY so it stays ready for a real source.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// `compose` transitively imports `lib/prisma`, which throws without
// DATABASE_URL. Mock the client so the occurrence source itself can be imported
// without a configured database — this test audits behaviour, not connectivity.
const prismaMock = vi.hoisted(() => ({ engineeringTakeoffScope: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { EmptyOccurrenceSource } from "@/src/infrastructure/engineering-takeoff/compose";
import { DRAWING_QUANTITY_PROHIBITED_TYPES } from "@/src/application/cross-document/materialization/VisionMaterializer";
import { CLAIM_PREDICATES, QUANTITY_ORIGINS } from "@/src/domain/cross-document/EvidenceClaim";

const repoRoot = path.resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("Phase 2A-11 §9 drawing-symbol occurrence governance", () => {
  it("records the truthful blocker: the production occurrence source supplies no occurrences", async () => {
    const source = new EmptyOccurrenceSource();
    const occurrences = await source.listOccurrences({
      companyId: "c1",
      takeoffScopeId: "s1",
      artifactIds: ["a1", "a2"],
      family: "DXF",
    });
    expect(occurrences).toEqual([]);
  });

  it("2A-10 exposes no counted-occurrence predicate, so no symbol count can become a quantity", () => {
    const forbidden = ["COUNTED", "OCCURRENCE", "COUNT", "SYMBOL_COUNT"];
    for (const predicate of CLAIM_PREDICATES) {
      for (const f of forbidden) {
        expect(predicate.includes(f)).toBe(false);
      }
    }
  });

  it("2A-10 quantity origins are exactly STATED and DECLARED_MODEL — there is no drawing-count origin", () => {
    expect([...QUANTITY_ORIGINS].sort()).toEqual(["DECLARED_MODEL", "STATED"]);
    // An approval can never be read back as an evidence quantity origin.
    expect(QUANTITY_ORIGINS as readonly string[]).not.toContain("APPROVED");
  });

  it("SYMBOL_CANDIDATE is prohibited as a drawing quantity type", () => {
    expect(DRAWING_QUANTITY_PROHIBITED_TYPES).toContain("SYMBOL_CANDIDATE");
  });

  it("the DXF materializer reports zero quantity claims from structural counts", () => {
    const src = read("src/application/cross-document/materialization/DxfMaterializer.ts");
    expect(src).toMatch(/ZERO quantity claims/);
    expect(src).toMatch(/DXF_REFUSED_INGESTION_METRICS/);
    expect(src).toMatch(/"entityCount"/);
    expect(src).toMatch(/"entityTypeCounts"/);
  });

  it("no production engineering file fabricates occurrences from a count or summary", () => {
    const files = [
      "src/infrastructure/engineering-takeoff/compose.ts",
      "src/infrastructure/engineering-takeoff/PrismaEngineeringStore.ts",
    ];
    for (const file of files) {
      const src = read(file);
      // Strip comments so documentation OF the blocker is not mistaken for the
      // fabrication itself.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/(^|[^:])\/\/.*$/gmu, "$1");
      // No synthetic occurrence construction in production code.
      expect(code).not.toMatch(/SYMBOL_CANDIDATE/);
      expect(code).not.toMatch(/entityTypeCounts/);
    }
    // The occurrence source is empty by construction, not derived from counts.
    const composeCode = read("src/infrastructure/engineering-takeoff/compose.ts")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/(^|[^:])\/\/.*$/gmu, "$1");
    expect(composeCode).toMatch(/return \[\];/);
  });
});
