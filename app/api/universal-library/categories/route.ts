import {
  GetUniversalTaxonomy,
  PrismaUniversalLibraryRepository,
} from "../../../../features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "../../../../lib/api";
import { prisma } from "../../../../lib/prisma";
import { serializeUniversalCategory } from "../serialize-universal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repository = new PrismaUniversalLibraryRepository(prisma);
const getUniversalTaxonomy = new GetUniversalTaxonomy(repository);

function parseBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseLimit(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw ApiError.badRequest("INVALID_LIMIT", "limit must be a positive integer.");
  }
  return parsed;
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request: Request) => {
    const searchParams = new URL(request.url).searchParams;
    const parentIdParam = searchParams.get("parentId");
    const parentId = parentIdParam === "null" ? null : parentIdParam ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const isActive = parseBoolean(searchParams.get("isActive"));

    const categories = await getUniversalTaxonomy.execute({
      parentId,
      search,
      isActive,
      limit: parseLimit(searchParams.get("limit")),
    });

    return apiSuccess(categories.map(serializeUniversalCategory), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
);
