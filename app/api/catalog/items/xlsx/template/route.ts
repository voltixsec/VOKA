import { NextResponse } from "next/server";
import { withCompanyAuth } from "@/lib/api";
import { buildCatalogTemplateBuffer, xlsxResponseHeaders } from "@/features/catalog/application/xlsx/catalogXlsx";
import { loadCatalogXlsxLookups } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (_request, _auth, company) => {
    const lookups = await loadCatalogXlsxLookups(company.companyId);
    const bytes = await buildCatalogTemplateBuffer(lookups);
    return new NextResponse(bytes, { headers: xlsxResponseHeaders("voka-catalog-template.xlsx") });
  },
);
