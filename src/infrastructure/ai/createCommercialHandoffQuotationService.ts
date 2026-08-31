import { CreateQuotationFromCommercialHandoff } from "@/src/application/conversation-runtime";
import { PrismaCommercialHandoffQuotationPort } from "./PrismaCommercialHandoffQuotationPort";

export function createCommercialHandoffQuotationService() {
  return new CreateQuotationFromCommercialHandoff(new PrismaCommercialHandoffQuotationPort());
}
