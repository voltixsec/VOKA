import { SendQuotationUseCase } from "@/src/application/quotation";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";

import { createQuotationActionHandler } from "../quotation-action";

const repository = new PrismaQuotationRepository();

export const POST = createQuotationActionHandler(
  ["OWNER", "ADMIN", "SALES"] as const,
  SendQuotationUseCase,
  repository,
);
