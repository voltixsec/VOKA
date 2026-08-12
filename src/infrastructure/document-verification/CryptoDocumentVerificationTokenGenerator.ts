import { randomBytes } from "node:crypto";
import type { DocumentVerificationTokenGenerator } from "@/src/domain/document-verification/DocumentVerificationToken";

export class CryptoDocumentVerificationTokenGenerator implements DocumentVerificationTokenGenerator {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }
}
