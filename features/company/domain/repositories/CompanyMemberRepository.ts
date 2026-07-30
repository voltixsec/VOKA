import type { Repository } from '../../../../lib/core';
import type {
  CompanyMember,
  CompanyRole,
  MembershipStatus,
} from '../entities';

export interface CompanyMemberRepository
  extends Repository<CompanyMember, string> {
  findByCompanyAndUser(
    companyId: string,
    userId: string,
  ): Promise<CompanyMember | null>;

  findByCompanyId(
    companyId: string,
  ): Promise<CompanyMember[]>;

  findByUserId(
    userId: string,
  ): Promise<CompanyMember[]>;

  findByCompanyAndRole(
    companyId: string,
    role: CompanyRole,
  ): Promise<CompanyMember[]>;

  findByCompanyAndStatus(
    companyId: string,
    status: MembershipStatus,
  ): Promise<CompanyMember[]>;
}
