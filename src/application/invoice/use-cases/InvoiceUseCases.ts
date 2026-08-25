import type { CreateInvoiceRequest, IInvoiceRepository, RecordPaymentRequest, UpdateInvoiceRequest } from "../repositories/IInvoiceRepository";

export class CreateInvoiceUseCase {
  constructor(private readonly repository: IInvoiceRepository) {}
  execute(request: CreateInvoiceRequest) { return this.repository.create(request); }
}
export class GetInvoiceUseCase {
  constructor(private readonly repository: IInvoiceRepository) {}
  execute(companyId: string, invoiceId: string) { return this.repository.findById(companyId, invoiceId); }
}
export class UpdateDraftInvoiceUseCase {
  constructor(private readonly repository: IInvoiceRepository) {}
  execute(request: UpdateInvoiceRequest) { return this.repository.updateDraft(request); }
}
export class ListInvoicesUseCase {
  constructor(private readonly repository: IInvoiceRepository) {}
  execute(input: Parameters<IInvoiceRepository["list"]>[0]) { return this.repository.list(input); }
}
export class IssueInvoiceUseCase {
  constructor(private readonly repository: IInvoiceRepository) {}
  execute(companyId: string, invoiceId: string, actor: Parameters<IInvoiceRepository["issue"]>[2]) { return this.repository.issue(companyId, invoiceId, actor); }
}
export class VoidInvoiceUseCase {
  constructor(private readonly repository: IInvoiceRepository) {}
  execute(companyId: string, invoiceId: string, actor: Parameters<IInvoiceRepository["void"]>[2], reason: string) { return this.repository.void(companyId, invoiceId, actor, reason); }
}
export class RecordPaymentUseCase {
  constructor(private readonly repository: IInvoiceRepository) {}
  execute(request: RecordPaymentRequest) { return this.repository.recordPayment(request); }
}
