import { NextResponse } from "next/server";
import { ApiError, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assertSignatoryIdentity, parseSignatoryInput } from "./signatory-input";

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (_request, _auth, company) => {
  const data = await prisma.authorizedSignatory.findMany({ where: { companyId: company.companyId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withCompanyAuth(["OWNER", "ADMIN"], async (request, _auth, company) => {
  const input = parseSignatoryInput(await request.json() as Record<string, unknown>);
  assertSignatoryIdentity(input);
  if (input.isDefault && input.isActive === false) throw ApiError.badRequest("DEFAULT_SIGNATORY_INACTIVE", "The default signatory must be active.");
  const data = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.authorizedSignatory.updateMany({ where: { companyId: company.companyId, isDefault: true }, data: { isDefault: false } });
    return tx.authorizedSignatory.create({ data: {
      companyId: company.companyId, nameAr: input.nameAr, nameEn: input.nameEn,
      titleAr: input.titleAr, titleEn: input.titleEn, signatureUrl: input.signatureUrl,
      isActive: input.isActive ?? true, isDefault: input.isDefault ?? false,
      allowedDocumentTypes: input.allowedDocumentTypes!,
    } });
  });
  return NextResponse.json({ data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
});
