import { NextResponse } from "next/server";
import { ApiError, withCompanyAuth } from "@/lib/api";
import { ListCatalogItems, type CatalogItemType } from "@/features/catalog";
import { buildCatalogExportBuffer, xlsxResponseHeaders } from "@/features/catalog/application/xlsx/catalogXlsx";
import { catalogItemRepository, loadCatalogXlsxLookups } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTypes: CatalogItemType[] = ["PRODUCT", "SERVICE", "SHIPPING", "LABOR", "DISCOUNT", "CUSTOM"];

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, company) => {
    const params = new URL(request.url).searchParams;
    const rawType = params.get("type");
    if (rawType && !allowedTypes.includes(rawType as CatalogItemType)) {
      throw ApiError.badRequest("INVALID_CATALOG_ITEM_TYPE", "Catalog item type is invalid.");
    }
    const list = new ListCatalogItems(catalogItemRepository);
    const lookups = await loadCatalogXlsxLookups(company.companyId);
    const unitById = new Map(lookups.units.map((unit) => [unit.id, unit.symbol]));
    const taxById = new Map(lookups.taxRates.map((tax) => [tax.id, `${tax.name} ${tax.percentage}%`]));
    const items = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const result = await list.execute({
        companyId: company.companyId,
        search: params.get("search") ?? undefined,
        type: (rawType as CatalogItemType | undefined) || undefined,
        page,
        pageSize: 100,
      });
      totalPages = result.totalPages || 0;
      items.push(
        ...result.items.map((item) => ({
          type: item.type,
          code: item.code,
          name: item.name,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          salePrice: item.salePrice,
          purchasePrice: item.purchasePrice,
          sku: item.sku,
          barcode: item.barcode,
          unitLabel: item.unitId ? unitById.get(item.unitId) ?? null : null,
          taxLabel: item.taxRateId ? taxById.get(item.taxRateId) ?? null : null,
          description: item.description,
          descriptionAr: item.descriptionAr,
          descriptionEn: item.descriptionEn,
          trackInventory: item.trackInventory,
          allowDiscount: item.allowDiscount,
          isActive: item.isActive,
          notes: item.notes,
        })),
      );
      if (totalPages === 0) break;
      page += 1;
    }
    const bytes = await buildCatalogExportBuffer(items);
    return new NextResponse(bytes, { headers: xlsxResponseHeaders("voka-catalog.xlsx") });
  },
);
