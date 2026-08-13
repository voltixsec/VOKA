import {
  ApiError,
  withCompanyAuth,
} from "@/lib/api";

import {
  GenerateQuotationDocumentUseCase,
  type DocumentLocale,
} from "@/src/application/document";

import {
  PdfKitQuotationDocumentRenderer,
} from "@/src/infrastructure/document/pdfkit/PdfKitQuotationDocumentRenderer";
import {
  PrismaQuotationDocumentProvider,
} from "@/src/infrastructure/document/PrismaQuotationDocumentProvider";

import {
  PrismaQuotationRepository,
} from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";

import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const documentProvider = new PrismaQuotationDocumentProvider(
  new GenerateQuotationDocumentUseCase(
    new PrismaQuotationRepository(),
    new PdfKitQuotationDocumentRenderer(),
  ),
);

function getQuotationId(
  request: Request,
): string {
  const quotationId =
    new URL(request.url)
      .pathname
      .split("/")
      .filter(Boolean)
      .at(-2);

  if (
    !quotationId ||
    quotationId ===
      "quotations"
  ) {
    throw ApiError.badRequest(
      "QUOTATION_ID_REQUIRED",
      "quotationId is required.",
    );
  }

  return decodeURIComponent(
    quotationId,
  );
}

function getLocale(
  request: Request,
  userLocale: string,
): DocumentLocale {
  const requested =
    new URL(request.url)
      .searchParams
      .get("locale")
      ?.toLowerCase();

  if (
    requested &&
    requested !== "ar" &&
    requested !== "en"
  ) {
    throw ApiError.badRequest(
      "DOCUMENT_LOCALE_INVALID",
      "locale must be ar or en.",
    );
  }

  return (
    requested === "ar" ||
    (
      !requested &&
      userLocale
        .toLowerCase()
        .startsWith("ar")
    )
      ? "ar"
      : "en"
  );
}

function getDisposition(
  request: Request,
): "attachment" | "inline" {
  const disposition =
    new URL(request.url)
      .searchParams
      .get("disposition")
      ?.toLowerCase();

  if (!disposition) {
    return "attachment";
  }

  if (
    disposition !== "attachment" &&
    disposition !== "inline"
  ) {
    throw ApiError.badRequest(
      "DOCUMENT_DISPOSITION_INVALID",
      "disposition must be attachment or inline.",
      {
        field: "disposition",
      },
    );
  }

  return disposition;
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
      request,
      auth,
      companyContext,
    ) => {
      const locale =
        getLocale(
          request,
          auth.user.locale,
        );

      const disposition =
        getDisposition(request);

      const result =
        await documentProvider
          .generate({
            companyId:
              companyContext
                .companyId,
            quotationId:
              getQuotationId(
                request,
              ),
            locale,
          });

      if (!result.success) {
        throw ApiError.notFound(
          result.error.code,
          result.error.message,
        );
      }

      return new NextResponse(
        Buffer.from(
          result.data.bytes,
        ),
        {
          status: 200,

          headers: {
            "Content-Type":
              "application/pdf",

            "Content-Disposition":
              `${disposition}; filename="${result.data.filename}"`,

            "Cache-Control":
              "private, no-store",

            "X-Content-Type-Options":
              "nosniff",
          },
        },
      );
    },
  );
