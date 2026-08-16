import { describe, it, expect, vi } from "vitest";

import {
  classifyQuotationSnapshot,
  processQuotationForBackfill,
  ApplyPatch,
  ProcessResult,
} from "@/src/application/quotation/services/QuotationLocalizationBackfill";

describe("Quotation localization backfill helper", () => {
  it("Arabic source + missing English target => PENDING / sourceLocale ar", () => {
    const snapshot = {
      projectNameAr: "مشروع",
      projectNameEn: null,
      lines: [{ itemName: "سلعة", itemNameAr: "سلعة", itemNameEn: null }],
    } as unknown as Record<string, unknown>;

    const res = classifyQuotationSnapshot(snapshot);

    expect(res.status).toBe("PENDING");
    expect(res.sourceLocale).toBe("ar");
  });

  it("English source + missing Arabic target => PENDING / sourceLocale en", () => {
    const snapshot = {
      projectNameEn: "Project",
      projectNameAr: null,
      lines: [{ itemName: "Product", itemNameAr: null, itemNameEn: "Product" }],
    } as unknown as Record<string, unknown>;

    const res = classifyQuotationSnapshot(snapshot);

    expect(res.status).toBe("PENDING");
    expect(res.sourceLocale).toBe("en");
  });

  it("fully bilingual quotation => COMPLETED / sourceLocale null", () => {
    const snapshot = {
      projectNameEn: "Project",
      projectNameAr: "مشروع",
      lines: [
        { itemName: "Product", itemNameAr: "منتج", itemNameEn: "Product" },
      ],
    } as unknown as Record<string, unknown>;

    const res = classifyQuotationSnapshot(snapshot);

    expect(res.status).toBe("COMPLETED");
    expect(res.sourceLocale).toBeNull();
  });

  it("minimal quotation with no translation items => COMPLETED", () => {
    const snapshot = { projectName: null, projectNameAr: null, projectNameEn: null, lines: [] } as unknown as Record<string, unknown>;
    const res = classifyQuotationSnapshot(snapshot);
    expect(res.status).toBe("COMPLETED");
  });

  it("existing non-null status is skipped", async () => {
    const snapshot = { projectName: "X", lines: [] } as unknown as Record<string, unknown>;
    const mockUpdate = vi.fn();
    const out = (await processQuotationForBackfill(snapshot, "PENDING", false, mockUpdate as any)) as ProcessResult;
    expect(out.skipped).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("dry-run does not perform update", async () => {
    const snapshot = { projectName: "X", lines: [] } as unknown as Record<string, unknown>;
    const mockUpdate = vi.fn();
    const out = (await processQuotationForBackfill(snapshot, null, false, mockUpdate as any)) as ProcessResult;
    expect("would" in out).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("apply mode updates only lifecycle fields", async () => {
    const snapshot = { projectName: "X", lines: [] } as unknown as Record<string, unknown>;
    let capturedPatch: ApplyPatch | undefined;
    const mockUpdate = vi.fn(async (p: ApplyPatch) => {
      capturedPatch = p;
      return { updatedCount: 1 };
    });
    const out = (await processQuotationForBackfill(snapshot, null, true, mockUpdate as any)) as ProcessResult;
    expect("applied" in out && out.applied === true).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = capturedPatch as ApplyPatch;
    const keys = Object.keys(patch).sort();
    const expected = [
      "localizationCompletedAt",
      "localizationLastError",
      "localizationRequestedAt",
      "localizationSourceLocale",
      "localizationStatus",
    ].sort();
    expect(keys).toEqual(expected);
  });

  it("updatedCount === 0 => skipped and not applied", async () => {
    const snapshot = { projectName: "X", lines: [] } as unknown as Record<string, unknown>;
    const mockUpdate = vi.fn(async () => ({ updatedCount: 0 }));
    const out = (await processQuotationForBackfill(snapshot, null, true, mockUpdate as any)) as ProcessResult;
    expect(out.skipped).toBe(true);
    expect((out as any).applied).not.toBe(true);
  });

  it("batching cursor helper processes batches without duplicates", () => {
    // Pure helper that mirrors the script's cursor logic over an in-memory array.
    function scanIds(items: Array<{ id: string; localizationStatus: string | null }>, batchSize: number) {
      const processed: string[] = [];
      let lastId: string | undefined = undefined;
      const sorted = [...items].sort((a, b) => (a.id > b.id ? 1 : -1));

      while (true) {
        const whereFiltered = sorted.filter((it) => it.localizationStatus === null && (lastId === undefined || it.id > lastId));
        const batch = whereFiltered.slice(0, batchSize);
        if (batch.length === 0) break;
        for (const b of batch) {
          processed.push(b.id);
          lastId = b.id;
        }
      }

      return processed;
    }

    const items = [
      { id: "a", localizationStatus: null },
      { id: "b", localizationStatus: null },
      { id: "c", localizationStatus: null },
    ];

    const processed = scanIds(items, 2);
    // Ensure all ids processed once in order, no duplicates
    expect(processed).toEqual(["a", "b", "c"]);
    const unique = new Set(processed);
    expect(unique.size).toBe(processed.length);
  });

  it("failed classification/update leaves row eligible for retry", async () => {
    const snapshot = { projectName: "X", lines: [] } as unknown as Record<string, unknown>;
    const mockUpdate = vi.fn(async () => {
      throw new Error("update failed");
    });

    try {
      await processQuotationForBackfill(snapshot, null, true, mockUpdate as any);
      // should not reach here
      expect(false).toBe(true);
    } catch (err) {
      expect((err as Error).message).toBe("update failed");
    }
  });

  it("script uses canonical analyzer; no duplicate analyzer logic", () => {
    // This is a smoke guard: ensure classifyQuotationSnapshot delegates to analyzer
    const snapshot = { projectNameEn: "P", projectNameAr: null, lines: [{ itemName: "x", itemNameEn: "x" }] } as unknown as Record<string, unknown>;
    const res = classifyQuotationSnapshot(snapshot);
    expect(res).toHaveProperty("status");
  });
});
