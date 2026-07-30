import type { NextResponse } from 'next/server';

import {
  requireCompanyRole,
  type AuthorizedCompanyContext,
  type CompanyRole,
} from '../auth';
import type { AuthContext } from '../../types/auth';
import { withAuth } from './with-auth';

export type CompanyAuthenticatedRouteHandler = (
  request: Request,
  auth: AuthContext,
  company: AuthorizedCompanyContext,
) => Promise<NextResponse> | NextResponse;

export function withCompanyAuth(
  allowedRoles: readonly CompanyRole[],
  handler: CompanyAuthenticatedRouteHandler,
) {
  return withAuth(async (request, auth) => {
    const company = requireCompanyRole(
      auth,
      allowedRoles,
    );

    return handler(
      request,
      auth,
      company,
    );
  });
}
