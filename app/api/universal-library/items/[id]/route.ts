import {
  GetUniversalItem,
  PrismaUniversalLibraryRepository,
} from "../../../../../features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "../../../../../lib/api";
import { prisma } from "../../../../../lib/prisma";
import { serializeUniversalItem } from "../../serialize-universal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repository = new PrismaUniversalLibraryRepository(prisma);
const getUniversalItem = new GetUniversalItem(repository);

function getItemId(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const value = parts.at(-1);
  if (!value || value === "items") {
    throw ApiError.badRequest("MISSING_ITEM_ID", "Universal item ID is required.");
  }
  return decodeURIComponent(value);
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request: Request, _auth, _company) => {
    const itemId = getItemId(request);

    const item = await getUniversalItem.execute(itemId);

    if (!item) {
      throw ApiError.notFound(
        "UNIVERSAL_ITEM_NOT_FOUND",
        `Universal item '${itemId}' was not found.`
      );
    }

    return apiSuccess(serializeUniversalItem(item), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
);
