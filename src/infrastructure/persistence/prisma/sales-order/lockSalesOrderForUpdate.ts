import type { Prisma } from "../../../../../lib/generated/prisma/client";

type SalesOrderLockTransaction = Pick<Prisma.TransactionClient, "$queryRaw">;

export async function lockSalesOrderForUpdate(
  tx: SalesOrderLockTransaction,
  companyId: string,
  salesOrderId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "SalesOrder"
    WHERE "id" = ${salesOrderId}
      AND "companyId" = ${companyId}
    FOR UPDATE
  `;

  return rows.length === 1;
}
