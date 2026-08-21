import {
  PrismaUniversalLibraryRepository,
  SearchUniversalManufacturers,
} from "../../../../features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "../../../../lib/api";
import { prisma } from "../../../../lib/prisma";
import { serializeUniversalManufacturer } from "../serialize-universal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repository = new PrismaUniversalLibraryRepository(prisma);
const searchUniversalManufacturers = new SearchUniversalManufacturers(repository);

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw ApiError.badRequest("INVALID_LIMIT", "limit must be a positive integer.");
  }
  return parsed;
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw ApiError.badRequest("INVALID_BOOLEAN", "Boolean filter must be true or false.");
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request: Request) => {
    const searchParams = new URL(request.url).searchParams;
    const query = searchParams.get("q") ?? searchParams.get("query") ?? undefined;
    const isActive = parseBoolean(searchParams.get("isActive"));
    const limit = parsePositiveInteger(searchParams.get("limit"));

    const manufacturers = await searchUniversalManufacturers.execute({
      query,
      isActive,
      limit,
    });

    return apiSuccess(manufacturers.map(serializeUniversalManufacturer), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
);
