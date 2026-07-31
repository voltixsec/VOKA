import type { NextRequest } from 'next/server';

import type {
  CompanyRole,
  Locale,
} from '../generated/prisma/client';

import { prisma } from '../prisma';
import { ApiError } from './ApiError';

export type RequestContext = {
  user: {
    id: string;
    email: string;
    name: string | null;
    locale: Locale;
  };
  company: {
    id: string;
    name: string;
    slug: string;
    defaultLocale: Locale;
    defaultCurrency: string;
    timezone: string;
  };
  membership: {
    id: string;
    role: CompanyRole;
  };
};

export type RequireRequestContextOptions = {
  allowedRoles?: CompanyRole[];
};

export async function requireRequestContext(
  request: NextRequest,
  options: RequireRequestContextOptions = {},
): Promise<RequestContext> {
  const userId =
    request.headers.get('x-user-id')?.trim();

  const companyId =
    request.headers.get('x-company-id')?.trim();

  if (!userId) {
    throw ApiError.unauthorized(
      'USER_CONTEXT_REQUIRED',
      'The x-user-id header is required.',
    );
  }

  if (!companyId) {
    throw ApiError.badRequest(
      'COMPANY_CONTEXT_REQUIRED',
      'The x-company-id header is required.',
    );
  }

  const membership =
    await prisma.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId,
          userId,
        },
      },
      include: {
        user: true,
        company: true,
      },
    });

  if (!membership) {
    throw ApiError.forbidden(
      'COMPANY_MEMBERSHIP_NOT_FOUND',
      'The user is not a member of this company.',
    );
  }

  if (!membership.user.isActive) {
    throw ApiError.forbidden(
      'USER_INACTIVE',
      'The user account is inactive.',
    );
  }

  if (!membership.company.isActive) {
    throw ApiError.forbidden(
      'COMPANY_INACTIVE',
      'The company account is inactive.',
    );
  }

  if (membership.status !== 'ACTIVE') {
    throw ApiError.forbidden(
      'MEMBERSHIP_INACTIVE',
      'The company membership is not active.',
    );
  }

  if (
    options.allowedRoles &&
    !options.allowedRoles.includes(
      membership.role,
    )
  ) {
    throw ApiError.forbidden(
      'INSUFFICIENT_ROLE',
      'The current role cannot perform this action.',
    );
  }

  return {
    user: {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      locale: membership.user.locale,
    },
    company: {
      id: membership.company.id,
      name: membership.company.name,
      slug: membership.company.slug,
      defaultLocale:
        membership.company.defaultLocale,
      defaultCurrency:
        membership.company.defaultCurrency,
      timezone: membership.company.timezone,
    },
    membership: {
      id: membership.id,
      role: membership.role,
    },
  };
}