import {
  GetUniversalTaxonomy,
  PrismaUniversalLibraryRepository,
} from "../../../../features/universal-library";
import { apiSuccess, withCompanyAuth } from "../../../../lib/api";
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
    });

    return apiSuccess(categories.map(serializeUniversalCategory), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
);
