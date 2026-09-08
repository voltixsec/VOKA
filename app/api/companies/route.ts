import { NextResponse } from 'next/server';

import { CreateCompany } from '../../../features/company/application/commands';
import { PrismaCompanyRepository } from '../../../features/company/infrastructure/prisma';
import type { Company } from '../../../features/company/domain/entities';
import { withPlatformAdminAuth } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';

const companyRepository =
  new PrismaCompanyRepository(prisma);

const createCompany =
  new CreateCompany(companyRepository);

function serializeCompany(company: Company) {
  return {
    id: company.id.toString(),
    name: company.name,
    slug: company.slug,
    defaultLocale: company.defaultLocale,
    defaultCurrency: company.defaultCurrency,
    timezone: company.timezone,
    isActive: company.isActive,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
}

// Platform-admin only: anonymous and ordinary tenant users must not be able to
// enumerate every active company on the platform or create (orphan) companies.
export const GET = withPlatformAdminAuth(
  ['OWNER', 'ADMIN'],
  async () => {
    const companies =
      await companyRepository.findAllActive();

    return NextResponse.json({
      data: companies.map(serializeCompany),
    });
  },
);

export const POST = withPlatformAdminAuth(
  ['OWNER', 'ADMIN'],
  async (request: Request) => {
    try {
      const body = (await request.json()) as {
        name?: unknown;
        slug?: unknown;
        defaultLocale?: unknown;
        defaultCurrency?: unknown;
        timezone?: unknown;
      };

      if (
        typeof body.name !== 'string' ||
        !body.name.trim()
      ) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_COMPANY_NAME',
              message: 'Company name is required.',
            },
          },
          { status: 400 },
        );
      }

      const result = await createCompany.execute({
        name: body.name,
        slug:
          typeof body.slug === 'string'
            ? body.slug
            : undefined,
        defaultLocale:
          body.defaultLocale === 'AR' ? 'AR' : 'EN',
        defaultCurrency:
          typeof body.defaultCurrency === 'string'
            ? body.defaultCurrency
            : undefined,
        timezone:
          typeof body.timezone === 'string'
            ? body.timezone
            : undefined,
      });

      if (!result.isSuccess) {
        const error = result.getError();

        return NextResponse.json(
          {
            error: {
              code: error.code,
              message: error.message,
            },
          },
          {
            status:
              error.code ===
              'COMPANY_SLUG_ALREADY_EXISTS'
                ? 409
                : 400,
          },
        );
      }

      return NextResponse.json(
        {
          data: serializeCompany(
            result.getValue(),
          ),
        },
        { status: 201 },
      );
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'The company could not be created.',
          },
        },
        { status: 500 },
      );
    }
  },
);
