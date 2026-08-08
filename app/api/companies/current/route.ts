import {
  NextResponse,
} from "next/server";

import {
  ApiError,
  withCompanyAuth,
} from "@/lib/api";

import {
  prisma,
} from "@/lib/prisma";

import {
  PrismaCompanyRepository,
} from "@/features/company/infrastructure/prisma/PrismaCompanyRepository";

const repository =
  new PrismaCompanyRepository(
    prisma,
  );

function serializeCompany(
  company:
    Awaited<
      ReturnType<
        typeof repository.findById
      >
    > &
    object,
) {
  return {
    id:
      company.id.toString(),

    name:
      company.name,

    nameAr:
      company.nameAr,

    nameEn:
      company.nameEn,

    addressAr:
      company.addressAr,

    addressEn:
      company.addressEn,

    poBox:
      company.poBox,

    phone:
      company.phone,

    mobile:
      company.mobile,

    whatsapp:
      company.whatsapp,

    logoUrl:
      company.logoUrl,

    defaultLocale:
      company.defaultLocale,

    defaultCurrency:
      company.defaultCurrency,

    timezone:
      company.timezone,
  };
}

function parseOptionalString(
  body: Record<
    string,
    unknown
  >,
  field: string,
): string | null | undefined {
  const value =
    body[field];

  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    value === null
  ) {
    return null;
  }

  if (
    typeof value !==
    "string"
  ) {
    throw ApiError.badRequest(
      "COMPANY_FIELD_INVALID",
      field +
        " must be a string or null.",
    );
  }

  return value;
}

export const GET =
  withCompanyAuth(
    [
      "OWNER",
      "ADMIN",
      "SALES",
      "VIEWER",
    ],
    async (
      _request,
      _auth,
      context,
    ) => {
      const company =
        await repository.findById(
          context.companyId,
        );

      if (!company) {
        throw ApiError.notFound(
          "COMPANY_NOT_FOUND",
          "Company not found.",
        );
      }

      return NextResponse.json(
        {
          data:
            serializeCompany(
              company,
            ),
        },
        {
          status: 200,

          headers: {
            "Cache-Control":
              "private, no-store",
          },
        },
      );
    },
  );

export const PATCH =
  withCompanyAuth(
    [
      "OWNER",
      "ADMIN",
    ],
    async (
      request,
      _auth,
      context,
    ) => {
      const body =
        (
          await request.json()
        ) as Record<
          string,
          unknown
        >;

      const company =
        await repository.findById(
          context.companyId,
        );

      if (!company) {
        throw ApiError.notFound(
          "COMPANY_NOT_FOUND",
          "Company not found.",
        );
      }

      company.updateIdentity({
        nameAr:
          parseOptionalString(
            body,
            "nameAr",
          ),

        nameEn:
          parseOptionalString(
            body,
            "nameEn",
          ),

        addressAr:
          parseOptionalString(
            body,
            "addressAr",
          ),

        addressEn:
          parseOptionalString(
            body,
            "addressEn",
          ),

        poBox:
          parseOptionalString(
            body,
            "poBox",
          ),

        phone:
          parseOptionalString(
            body,
            "phone",
          ),

        mobile:
          parseOptionalString(
            body,
            "mobile",
          ),

        whatsapp:
          parseOptionalString(
            body,
            "whatsapp",
          ),

        logoUrl:
          parseOptionalString(
            body,
            "logoUrl",
          ),
      });

      if (
        body.defaultCurrency !==
        undefined
      ) {
        if (
          typeof body.defaultCurrency !==
          "string"
        ) {
          throw ApiError.badRequest(
            "INVALID_COMPANY_CURRENCY",
            "defaultCurrency must be a three-letter currency code.",
          );
        }

        const currencyResult =
          company.changeDefaultCurrency(
            body.defaultCurrency,
          );

        if (
          !currencyResult.isSuccess
        ) {
          const currencyError =
            currencyResult.getError();

          throw ApiError.badRequest(
            currencyError.code,
            currencyError.message,
          );
        }
      }

      const saved =
        await repository.save(
          company,
        );

      return NextResponse.json(
        {
          data:
            serializeCompany(
              saved,
            ),
        },
        {
          status: 200,

          headers: {
            "Cache-Control":
              "private, no-store",
          },
        },
      );
    },
  );
