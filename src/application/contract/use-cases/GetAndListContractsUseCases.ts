import type { Contract } from "../../../domain/contract";
import type { IContractRepository, ListContractsOptions, ListContractsResult } from "../repositories/IContractRepository";

export class GetContractUseCase {
  constructor(private readonly contractRepository: IContractRepository) {}

  async execute(companyId: string, id: string): Promise<Contract | null> {
    if (!companyId || !id) {
      return null;
    }
    return await this.contractRepository.findById(companyId, id);
  }
}

export class ListContractsUseCase {
  constructor(private readonly contractRepository: IContractRepository) {}

  async execute(options: ListContractsOptions): Promise<ListContractsResult> {
    if (!options.companyId) {
      return { items: [], total: 0, page: 1, pageSize: options.pageSize || 10 };
    }
    return await this.contractRepository.list(options);
  }
}
