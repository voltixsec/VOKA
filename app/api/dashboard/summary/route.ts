import { NextResponse } from "next/server";
import { withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (_request, _auth, company) => {
  const companyId = company.companyId;
  const [customers, catalogItems, quotations, salesOrders, contracts, invoices, payments] = await Promise.all([
    prisma.customer.count({ where: { companyId, isDeleted: false } }),
    prisma.catalogItem.count({ where: { companyId, isActive: true } }),
    prisma.quotation.count({ where: { companyId, isDeleted: false, isCurrentRevision: true, status: { in: ["DRAFT", "SENT"] } } }),
    prisma.salesOrder.count({ where: { companyId, status: { in: ["DRAFT", "CONFIRMED"] } } }),
    prisma.contract.count({ where: { companyId } }),
    prisma.invoice.count({ where: { companyId, status: "ISSUED", settlementStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } } }),
    prisma.payment.count({ where: { companyId } }),
  ]);
  return NextResponse.json({ data: { customers, catalogItems, quotations, salesOrders, contracts, invoices, payments } }, { headers: { "Cache-Control": "private, no-store" } });
});
