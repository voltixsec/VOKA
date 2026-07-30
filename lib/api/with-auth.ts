import type { NextResponse } from 'next/server';

import type { AuthContext } from '../../types/auth';
import { getCurrentUser } from '../auth';
import { handleApiError } from './error-handler';

export type AuthenticatedRouteHandler = (
  request: Request,
  auth: AuthContext,
) => Promise<NextResponse> | NextResponse;

export function withAuth(
  handler: AuthenticatedRouteHandler,
) {
  return async (
    request: Request,
  ): Promise<NextResponse> => {
    try {
      const auth = await getCurrentUser();

      return await handler(request, auth);
    } catch (error) {
      return handleApiError(error);
    }
  };
}
