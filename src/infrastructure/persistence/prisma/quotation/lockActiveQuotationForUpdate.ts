import type { Prisma } from "../../../../../lib/generated/prisma/client";

type QuotationLockTransaction = Pick<Prisma.TransactionClient, "$queryRaw">;

export async function lockActiveQuotationForUpdate(
  tx: QuotationLockTransaction,
  companyId: string,
  quotationId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Quotation"
    WHERE "id" = ${quotationId}
      AND "companyId" = ${companyId}
      AND "isDeleted" = FALSE
    FOR UPDATE
  `;

  return rows.length === 1;
}
