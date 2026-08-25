import { NextResponse } from "next/server";
import { ApiError, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assertSignatoryIdentity, parseSignatoryInput } from "../signatory-input";

function idFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = parts.at(-1)?.trim();
  if (!id) throw ApiError.badRequest("SIGNATORY_ID_REQUIRED", "Signatory id is required.");
  return id;
}

export const PATCH = withCompanyAuth(["OWNER", "ADMIN"], async (request, _auth, company) => {
  const id = idFrom(request);
  const current = await prisma.authorizedSignatory.findFirst({ where: { id, companyId: company.companyId } });
  if (!current) throw ApiError.notFound("SIGNATORY_NOT_FOUND", "Authorized signatory not found.");
  const input = parseSignatoryInput(await request.json() as Record<string, unknown>);
  const merged = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) };
  assertSignatoryIdentity(merged);
  if (merged.isDefault && !merged.isActive) throw ApiError.badRequest("DEFAULT_SIGNATORY_INACTIVE", "The default signatory must be active.");
  const data = await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) await tx.authorizedSignatory.updateMany({ where: { companyId: company.companyId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
    return tx.authorizedSignatory.update({ where: { id }, data: input });
  });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
});
