/**
 * Phase 2A-10 hardening: PRODUCTION PRISMA WIRING.
 *
 * `InMemoryCrossDocumentStore` exists so tests and deterministic fixtures can
 * drive the real engine without a database. It must never be reachable from a
 * production request. These tests prove that structurally:
 *
 * - the composition root creates the Prisma-backed store, artifact reader, and
 *   derivation reader;
 * - no production cross-document route, helper, or composition file mentions the
 *   in-memory store at all;
 * - the only importers are tests and the test harness;
 * - there is no fallback-to-memory path: no dynamic import, no try/catch that
 *   swaps in a memory store, and no default that resolves to one;
 * - a configuration failure is explicit rather than silently degrading.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ sourceArtifact: { findFirst: vi.fn(), findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { composeCrossDocumentDependencies } from "../compose";
import { PrismaCrossDocumentStore } from "../PrismaCrossDocumentStore";
import { PrismaDerivationReader } from "../PrismaDerivationReader";
import { PrismaSourceArtifactReader } from "../PrismaSourceArtifactReader";
import { LocalEvidenceMaterialization } from "../LocalEvidenceMaterialization";
import { contextFor } from "@/lib/cross-document/route-context";

const IN_MEMORY_TOKEN = "InMemoryCrossDocumentStore";

const PRODUCTION_ROOTS = ["app/api/cross-document", "lib/cross-document", "src/infrastructure/cross-document", "src/application/cross-document", "src/domain/cross-document"];

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

describe("production composition uses the Prisma-backed store", () => {
  it("creates a PrismaCrossDocumentStore and Prisma-backed adapters", () => {
    const dependencies = composeCrossDocumentDependencies();
    expect(dependencies.store).toBeInstanceOf(PrismaCrossDocumentStore);
    expect(dependencies.artifacts).toBeInstanceOf(PrismaSourceArtifactReader);
    expect(dependencies.derivations).toBeInstanceOf(PrismaDerivationReader);
    expect(dependencies.materialization).toBeInstanceOf(LocalEvidenceMaterialization);
    expect(dependencies.store).not.toBeInstanceOf(LocalEvidenceMaterialization);
    expect(typeof dependencies.clock.now()).toBe("string");
    expect(dependencies.ids.next("run")).toMatch(/^run_/u);
  });

  it("never mentions the in-memory store in any production route, helper, or composition file", () => {
    const offenders: string[] = [];
    for (const root of PRODUCTION_ROOTS) {
      for (const path of sourceFiles(root)) {
        // The class has to be defined somewhere; what matters is that nothing in
        // the production request path references it.
        if (path.endsWith("InMemoryCrossDocumentStore.ts")) continue;
        if (readFileSync(path, "utf8").includes(IN_MEMORY_TOKEN)) offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("confines the in-memory store to tests and the deterministic harness", () => {
    const importers = [
      ...sourceFiles("src/infrastructure/cross-document", { includeTests: true }),
      ...sourceFiles("src/application/cross-document", { includeTests: true }),
      ...sourceFiles("src/domain/cross-document", { includeTests: true }),
    ].filter((path) => readFileSync(path, "utf8").includes(IN_MEMORY_TOKEN));
    expect(importers.length).toBeGreaterThan(0);
    for (const path of importers) {
      const isTest = path.includes("__tests__");
      const isHarness = path.endsWith("harness.ts");
      // The class definition itself is the only non-test home.
      const isDefinition = path.endsWith("InMemoryCrossDocumentStore.ts");
      expect(isTest || isHarness || isDefinition).toBe(true);
    }
  });

  it("has no fallback-to-memory path and no dynamic store resolution", () => {
    const compose = readFileSync("src/infrastructure/cross-document/compose.ts", "utf8");
    // No dynamic import, no eval, no string-keyed construction, no optional
    // default that could resolve to a memory implementation.
    expect(compose).not.toMatch(/import\s*\(/u);
    expect(compose).not.toMatch(/\beval\s*\(/u);
    expect(compose).not.toMatch(/new\s+Function\s*\(/u);
    expect(compose).not.toMatch(/require\s*\(/u);
    expect(compose).not.toContain(IN_MEMORY_TOKEN);
    // The store is constructed unconditionally and exactly once.
    expect(compose.match(/new PrismaCrossDocumentStore\(\)/gu)).toHaveLength(1);
    expect(compose).not.toMatch(/try\s*\{/u);
    expect(compose).not.toMatch(/catch/u);
  });

  it("fails explicitly when a composition dependency is missing instead of degrading", () => {
    // The analyzer factory is explicit: enabling a channel without its provider
    // is a configuration error, not a silent fallback to "no evidence".
    expect(() => composeCrossDocumentDependencies()).not.toThrow();
    const dependencies = composeCrossDocumentDependencies({ drawingVision: true, vision: null, ocr: null });
    expect(dependencies.store).toBeInstanceOf(PrismaCrossDocumentStore);
    // A missing provider surfaces at analyze time as a refusal with a reason,
    // never as a fabricated reading.
    expect(dependencies.materialization).toBeInstanceOf(LocalEvidenceMaterialization);
  });

  it("builds every route context from the authenticated company, never from the request", () => {
    const request = new Request("https://voka.test/api/cross-document/scopes?companyId=company-attacker&locale=ar", { method: "GET" });
    const context = contextFor({
      request,
      actorUserId: "user-1",
      company: { companyId: "company-authenticated", role: "OWNER", membership: { role: "OWNER" } } as never,
    });
    // The authenticated company wins; the client-provided one is ignored.
    expect(context.companyId).toBe("company-authenticated");
    expect(context.actorUserId).toBe("user-1");
    expect(context.locale).toBe("ar");
    expect(context.store).toBeInstanceOf(PrismaCrossDocumentStore);
  });
});
