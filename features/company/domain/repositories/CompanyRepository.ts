import type { Repository } from '../../../../lib/core';
import type { Company } from '../entities/Company';

export interface CompanyRepository
  extends Repository<Company, string> {
  findBySlug(slug: string): Promise<Company | null>;

  findAllActive(): Promise<Company[]>;
}