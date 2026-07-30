import { ApiError } from '../api';
import type {
  AuthContext,
  AuthMembership,
} from '../../types/auth';
import {
  getActiveCompany,
  type ActiveCompanyContext,
} from './get-active-company';

export const COMPANY_ROLES = [
  'OWNER',
  'ADMIN',
  'SALES',
  'VIEWER',
] as const;

export type CompanyRole =
  (typeof COMPANY_ROLES)[number];

export type AuthorizedCompanyContext =
  ActiveCompanyContext & {
    role: CompanyRole;
    membership: AuthMembership & {
      role: CompanyRole;
    };
  };

function isCompanyRole(
  role: string,
): role is CompanyRole {
  return COMPANY_ROLES.includes(
    role as CompanyRole,
  );
}

export function requireCompanyRole(
  auth: AuthContext,
  allowedRoles: readonly CompanyRole[],
): AuthorizedCompanyContext {
  const companyContext = getActiveCompany(auth);

  if (!isCompanyRole(companyContext.role)) {
    throw new ApiError(
      403,
      'INVALID_COMPANY_ROLE',
      'Your company role is not valid.',
    );
  }

  if (
    !allowedRoles.includes(companyContext.role)
  ) {
    throw new ApiError(
      403,
      'INSUFFICIENT_PERMISSIONS',
      'You do not have permission to perform this action.',
    );
  }

  return {
    ...companyContext,
    role: companyContext.role,
    membership: {
      ...companyContext.membership,
      role: companyContext.role,
    },
  };
}
