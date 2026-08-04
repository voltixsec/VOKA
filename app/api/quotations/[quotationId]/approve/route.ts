import { ApproveQuotationUseCase } from "@/src/application/quotation";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";

import { createQuotationActionHandler } from "../quotation-action";

const repository = new PrismaQuotationRepository();

export const POST = createQuotationActionHandler(
  ["OWNER", "ADMIN"] as const,
  ApproveQuotationUseCase,
  repository,
);
