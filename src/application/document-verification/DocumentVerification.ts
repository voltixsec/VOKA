export type PublicDocumentVerification = {
  result: "VALID" | "CANCELLED";
  documentType: "QUOTATION";
  documentNumber: string;
  issuingCompanyName: string;
  status: string;
  issueDate: Date;
  approvalDate: Date | null;
  currencyCode: string;
  totalValue: number;
};

export interface DocumentVerificationRepository {
  findPublicByToken(token: string): Promise<PublicDocumentVerification | null>;
}

export class GetDocumentVerificationUseCase {
  constructor(private readonly repository: DocumentVerificationRepository) {}

  execute(token: string): Promise<PublicDocumentVerification | null> {
    if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return Promise.resolve(null);
    return this.repository.findPublicByToken(token);
  }
}
