import { prisma } from "@/lib/prisma";
import type { DocumentVerificationRepository, PublicDocumentVerification } from "@/src/application/document-verification/DocumentVerification";

export class PrismaDocumentVerificationRepository implements DocumentVerificationRepository {
  async findPublicByToken(token: string): Promise<PublicDocumentVerification | null> {
    const quotation = await prisma.quotation.findUnique({
      where: { verificationToken: token },
      select: {
        number: true, status: true, issueDate: true, approvedAt: true,
        currencyCode: true, totalAmount: true, isDeleted: true,
        company: { select: { name: true, nameEn: true } },
      },
    });

    if (!quotation || quotation.isDeleted) return null;
    return {
      result: quotation.status === "CANCELLED" ? "CANCELLED" : "VALID",
      documentType: "QUOTATION",
      documentNumber: quotation.number,
      issuingCompanyName: quotation.company.nameEn || quotation.company.name,
      status: quotation.status,
      issueDate: quotation.issueDate,
      approvalDate: quotation.approvedAt,
      currencyCode: quotation.currencyCode,
      totalValue: Number(quotation.totalAmount),
    };
  }
}
