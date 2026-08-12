import { NextResponse } from "next/server";
import { GetDocumentVerificationUseCase } from "@/src/application/document-verification/DocumentVerification";
import { PrismaDocumentVerificationRepository } from "@/src/infrastructure/persistence/prisma/document-verification/PrismaDocumentVerificationRepository";

const verifyDocument = new GetDocumentVerificationUseCase(new PrismaDocumentVerificationRepository());

export async function GET(request: Request) {
  const token = decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ?? "");
  const result = await verifyDocument.execute(token);
  if (!result) {
    return NextResponse.json({ data: { result: "INVALID" } }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ data: result }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
