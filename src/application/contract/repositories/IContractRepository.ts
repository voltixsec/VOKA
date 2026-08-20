import type { Contract } from "../../../domain/contract";

export interface ListContractsOptions {
  companyId: string;
  status?: string;
  customerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ListContractsResult {
  items: Contract[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IContractRepository {
  save(contract: Contract): Promise<Contract>;
  findById(companyId: string, id: string): Promise<Contract | null>;
  findByNumber(companyId: string, number: string): Promise<Contract | null>;
  list(options: ListContractsOptions): Promise<ListContractsResult>;
  getNextContractNumber(companyId: string): Promise<string>;
}
