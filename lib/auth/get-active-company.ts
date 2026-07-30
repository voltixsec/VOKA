import { ApiError } from '../api';
import type {
  AuthContext,
  AuthMembership,
} from '../../types/auth';

export type ActiveCompanyContext = {
  companyId: string;
  membership: AuthMembership;
  role: string;
};

export function getActiveCompany(
  auth: AuthContext,
): ActiveCompanyContext {
  const activeCompanyId = auth.activeCompanyId;

  if (!activeCompanyId) {
    throw new ApiError(
      400,
      'ACTIVE_COMPANY_REQUIRED',
      'An active company must be selected.',
    );
  }

  const membership = auth.memberships.find(
    (item) =>
      item.company.id === activeCompanyId,
  );

  if (!membership) {
    throw new ApiError(
      403,
      'COMPANY_ACCESS_DENIED',
      'You do not have access to this company.',
    );
  }

  if (membership.status !== 'ACTIVE') {
    throw new ApiError(
      403,
      'MEMBERSHIP_NOT_ACTIVE',
      'Your company membership is not active.',
    );
  }

  if (!membership.company.isActive) {
    throw new ApiError(
      403,
      'COMPANY_NOT_ACTIVE',
      'This company is not active.',
    );
  }

  return {
    companyId: membership.company.id,
    membership,
    role: membership.role,
  };
}
