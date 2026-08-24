import type { IQuotationRevisionRepository } from "../repositories/IQuotationRevisionRepository";
import type { ApplicationResult } from "../results/ApplicationResult";
import type { Quotation } from "../../../domain/quotation";

export class CreateQuotationRevisionUseCase {
  constructor(private readonly revisions: IQuotationRevisionRepository) {}

  async execute(input: { companyId: string; quotationId: string }): Promise<ApplicationResult<Quotation>> {
    const result = await this.revisions.createFromApprovedSnapshot(
      input.companyId,
      input.quotationId,
    );

    if (result.kind === "CREATED") return { success: true, data: result.quotation };

    const errors = {
      NOT_FOUND: ["QUOTATION_NOT_FOUND", "Quotation not found."],
      NOT_CURRENT: ["QUOTATION_REVISION_NOT_CURRENT", "A revision can only be created from the current quotation revision."],
      NOT_APPROVED: ["QUOTATION_REVISION_REQUIRES_APPROVAL", "A revision can only be created from an approved quotation snapshot."],
    } as const;
    const [code, message] = errors[result.kind];
    return { success: false, error: { code, message } };
  }
}
