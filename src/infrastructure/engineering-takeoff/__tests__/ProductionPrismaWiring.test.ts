/**
 * Phase 2A-11 hardening: PRODUCTION PRISMA WIRING.
 *
 * `InMemoryEngineeringStore` exists so the application tests and the deterministic
 * harness can drive the real engine without a database. It must never be
 * reachable from a production request. These tests prove that structurally
 * rather than by convention:
 *
 * - the composition root builds the Prisma-backed store and the Prisma-backed
 *   2A-10 handoff reader;
 * - no production engineering route, helper, or composition file mentions the
 *   in-memory store at all;
 * - the only importers are tests and the harness;
 * - there is no fallback-to-memory path: no dynamic import, no `eval`, no
 *   `require`, and no try/catch that swaps in a memory store;
 * - a configuration failure is explicit rather than silently degrading.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ engineeringTakeoffScope: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { composeEngineeringDependencies, EmptyOccurrenceSource } from "../compose";
import { PrismaEngineeringStore } from "../PrismaEngineeringStore";
import { PrismaEngineeringHandoffReader } from "../PrismaEngineeringHandoffReader";

const IN_MEMORY_TOKEN = "InMemoryEngineeringStore";

const PRODUCTION_ROOTS = [
  "app/api/engineering",
  "lib/engineering",
  "src/infrastructure/engineering-takeoff",
  "src/application/engineering-takeoff",
  "src/domain/engineering-takeoff",
];

function sourceFiles(root: string, options: { includeTests?: boolean } = {}): string[] {
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
        if (entry === "__tests__" && !options.includeTests) continue;
        walk(path);
        continue;
      }
      if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
    }
  };
  walk(root);
  return out;
}

describe("production engineering composition is Prisma-backed", () => {
  it("creates a PrismaEngineeringStore and the Prisma 2A-10 handoff reader", () => {
    const dependencies = composeEngineeringDependencies();
    expect(dependencies.store).toBeInstanceOf(PrismaEngineeringStore);
    expect(dependencies.handoffReader).toBeInstanceOf(PrismaEngineeringHandoffReader);
    expect(dependencies.store).not.toBeInstanceOf(EmptyOccurrenceSource);
    expect(typeof dependencies.clock.now()).toBe("string");
    expect(dependencies.ids.next("ets")).toMatch(/^ets_/u);
  });

  it("exposes the full EngineeringStore surface from the production store", () => {
    const { store } = composeEngineeringDependencies();
    // The aggregate port is composed of the scope, rule, ledger, candidate,
    // decision, calculation, adjustment, and BOM stores. Every method must be
    // present on the production store, so no engine call can hit a hole.
    const requiredMethods = [
      "saveScope", "findScope", "listScopes", "updateScopeDerivedState",
      "saveCountingRule", "findCountingRule", "listCountingRules",
      "saveOccurrences", "listOccurrences", "countOccurrences",
      "saveCandidate", "findCandidate", "listCandidates", "saveCandidateSources", "listCandidateSources", "saveConflict", "listConflicts",
      "appendDecision", "findDecision", "retireDecision", "listDecisions", "currentDecision", "decisionHistory", "saveDecisionSources", "listDecisionSources", "saveDecisionClaims", "listDecisionClaims",
      "saveCalculation", "findCalculation", "listCalculationInputs", "listCalculations",
      "saveAdjustment", "findAdjustment", "listAdjustments",
      "saveBomVersion", "findBomVersion", "listBomVersions", "latestBomVersion", "approveBomVersion",
      "saveBomRows", "listBomRows", "findBomRow", "saveRowConstraints", "listRowConstraints", "saveRowAdjustments", "listRowAdjustments", "saveVersionDecisions", "listVersionDecisions",
    ];
    for (const method of requiredMethods) {
      expect(typeof (store as unknown as Record<string, unknown>)[method]).toBe("function");
    }
  });

  it("never mentions the in-memory store in any production route, helper, or composition file", () => {
    const offenders: string[] = [];
    for (const root of PRODUCTION_ROOTS) {
      for (const path of sourceFiles(root)) {
        // The class has to be defined somewhere; what matters is that nothing in
        // the production request path references it.
        if (path.endsWith("InMemoryEngineeringStore.ts")) continue;
        if (readFileSync(path, "utf8").includes(IN_MEMORY_TOKEN)) offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("confines the in-memory store to tests and the deterministic harness", () => {
    const importers = [
      ...sourceFiles("src/infrastructure/engineering-takeoff", { includeTests: true }),
      ...sourceFiles("src/application/engineering-takeoff", { includeTests: true }),
      ...sourceFiles("src/domain/engineering-takeoff", { includeTests: true }),
    ].filter((path) => readFileSync(path, "utf8").includes(IN_MEMORY_TOKEN));
    expect(importers.length).toBeGreaterThan(0);
    for (const path of importers) {
      const isTest = path.includes("__tests__");
      const isHarness = path.endsWith("harness.ts");
      // The class definition is the only non-test home, and it is never imported
      // by a production file (proved by the scan above).
      const isDefinition = path.endsWith("InMemoryEngineeringStore.ts");
      expect(isTest || isHarness || isDefinition).toBe(true);
    }
    // The definition itself must not be imported by any production composition or route.
    const productionImporters = [
      ...sourceFiles("src/infrastructure/engineering-takeoff"),
      ...sourceFiles("src/application/engineering-takeoff"),
      ...sourceFiles("src/domain/engineering-takeoff"),
    ].filter((path) => !path.includes("__tests__") && !path.endsWith("InMemoryEngineeringStore.ts"))
      .filter((path) => /from\s+["'][^"']*InMemoryEngineeringStore["']/u.test(readFileSync(path, "utf8")));
    expect(productionImporters).toEqual([]);
  });

  it("has no fallback-to-memory path and no dynamic store resolution", () => {
    const compose = readFileSync("src/infrastructure/engineering-takeoff/compose.ts", "utf8");
    expect(compose).not.toMatch(/import\s*\(/u);
    expect(compose).not.toMatch(/\beval\s*\(/u);
    expect(compose).not.toMatch(/new\s+Function\s*\(/u);
    expect(compose).not.toMatch(/require\s*\(/u);
    expect(compose).not.toContain(IN_MEMORY_TOKEN);
    // The store and the handoff reader are constructed unconditionally.
    expect(compose.match(/new PrismaEngineeringStore\(\)/gu)).toHaveLength(1);
    expect(compose.match(/new PrismaEngineeringHandoffReader\(\)/gu)).toHaveLength(1);
    expect(compose).not.toMatch(/try\s*\{/u);
    expect(compose).not.toMatch(/catch/u);
  });

  it("fails explicitly when the database is not configured instead of degrading to memory", async () => {
    // `lib/prisma` throws when DATABASE_URL is absent. The composition root must
    // not catch that: a misconfigured production deploy must fail loudly, not
    // quietly serve engineering truth from a process-local map.
    vi.resetModules();
    vi.doMock("@/lib/prisma", () => {
      throw new Error("DATABASE_URL is not configured.");
    });
    await expect(async () => {
      const module = await import("../PrismaEngineeringStore");
      const store = new module.PrismaEngineeringStore();
      await store.findScope({ companyId: "c1", takeoffScopeId: "s1" });
    }).rejects.toThrow();
    vi.doUnmock("@/lib/prisma");
    vi.resetModules();
  });

  it("supplies an occurrence source that returns no invented counts", async () => {
    const source = new EmptyOccurrenceSource();
    const occurrences = await source.listOccurrences({ companyId: "c1", takeoffScopeId: "s1", artifactIds: ["a1"], family: "DXF" });
    // No occurrence is fabricated from an aggregate summary: the set is empty.
    expect(occurrences).toEqual([]);
  });
});
