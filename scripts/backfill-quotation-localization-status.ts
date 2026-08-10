#!/usr/bin/env tsx
import { prisma } from "@/lib/prisma";
import { processQuotationForBackfill, ProcessResult } from "@/src/application/quotation/services/QuotationLocalizationBackfill";

type Args = {
  apply: boolean;
};

function parseArgs(): Args {
  return {
    apply: process.argv.includes("--apply"),
  };
}

export async function run() {
  const { apply } = parseArgs();

  const batchSize = 100;
  let lastId: string | undefined = undefined;

  let total = 0;
  let wouldPending = 0;
  let wouldCompleted = 0;
  let applied = 0;
  let errors = 0;

  while (true) {
    const where: { localizationStatus: null; id?: { gt: string } } = lastId
      ? { localizationStatus: null, id: { gt: lastId } }
      : { localizationStatus: null };

    const candidates = (await prisma.quotation.findMany({
      where,
      include: { lines: true },
      orderBy: { id: "asc" },
      take: batchSize,
    })) as Array<Record<string, any>>;

    if (candidates.length === 0) break;

    for (const q of candidates) {
      total += 1;

      const snapshot = {
        customer: { name: q.customerName, nameAr: q.customerNameAr, nameEn: q.customerNameEn },
        projectName: q.projectName,
        projectNameAr: q.projectNameAr,
        projectNameEn: q.projectNameEn,
        attentionName: q.attentionName,
        attentionNameAr: q.attentionNameAr,
        attentionNameEn: q.attentionNameEn,
        subjectAr: q.subjectAr,
        subjectEn: q.subjectEn,
        briefAr: q.briefAr,
        briefEn: q.briefEn,
        notes: q.notes,
        notesAr: q.notesAr,
        notesEn: q.notesEn,
        termsAndConditions: q.termsAndConditions,
        termsAndConditionsAr: q.termsAndConditionsAr,
        termsAndConditionsEn: q.termsAndConditionsEn,
        lines: q.lines.map((l: Record<string, unknown>) => ({
          itemName: l.itemName,
          itemNameAr: l.itemNameAr,
          itemNameEn: l.itemNameEn,
          description: l.description,
          descriptionAr: l.descriptionAr,
          descriptionEn: l.descriptionEn,
          unitName: l.unitName,
          unitNameAr: l.unitNameAr,
          unitNameEn: l.unitNameEn,
        })),
      } as const;

      try {
        const out = await processQuotationForBackfill(
          snapshot,
          q.localizationStatus as string | null,
          apply,
          async (patch) => {
            const res = await prisma.quotation.updateMany({
              where: { id: q.id, localizationStatus: null },
              data: patch,
            });
            return { updatedCount: res.count };
          },
        );
        if (!apply) {
          if ("would" in out && out.would.status === "PENDING") wouldPending += 1;
          else wouldCompleted += 1;
        } else {
          if ("applied" in out && out.applied === true) applied += 1;
        }
      } catch (err) {
        errors += 1;
        console.error("[BACKFILL][ERROR]", { id: q.id });
      }

      lastId = q.id;
    }
  }

  console.log("backfill:total", total);
  if (!apply) {
    console.log("backfill:wouldPending", wouldPending);
    console.log("backfill:wouldCompleted", wouldCompleted);
    console.log("backfill:errors", errors);
  } else {
    console.log("backfill:applied", applied);
    console.log("backfill:errors", errors);
  }

  if (apply && errors > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  run().catch(() => {
    console.error("[BACKFILL][FATAL]");
    process.exit(2);
  });
}
