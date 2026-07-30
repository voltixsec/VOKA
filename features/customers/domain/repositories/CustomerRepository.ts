import type { Repository } from '../../../../lib/core';
import type {
  Customer,
  CustomerStatus,
  CustomerType,
} from '../entities/Customer';

export type CustomerListFilters = {
  companyId: string;
  search?: string;
  status?: CustomerStatus;
  type?: CustomerType;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
};

export interface CustomerRepository
  extends Repository<Customer, string> {
  findByIdAndCompanyId(
    id: string,
    companyId: string,
  ): Promise<Customer | null>;

  findByCode(
    companyId: string,
    code: string,
  ): Promise<Customer | null>;

  findAll(
    filters: CustomerListFilters,
  ): Promise<Customer[]>;

  count(
    filters: CustomerListFilters,
  ): Promise<number>;

  deleteByIdAndCompanyId(
    id: string,
    companyId: string,
  ): Promise<void>;
}
