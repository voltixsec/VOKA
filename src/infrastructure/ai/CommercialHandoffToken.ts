import { SignJWT, jwtVerify } from "jose";
import type { CommercialSolutionHandoff } from "@/src/application/conversation-runtime";

const ISSUER = "voka-conversation-runtime";
const AUDIENCE = "voka-quotation-handoff";

function signingKey() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error("COMMERCIAL_HANDOFF_SIGNING_NOT_CONFIGURED");
  return new TextEncoder().encode(secret);
}

function isHandoff(value: unknown): value is CommercialSolutionHandoff {
  const handoff = value as Partial<CommercialSolutionHandoff> | null;
  return Boolean(handoff && typeof handoff.runtimeId === "string" && handoff.runtimeId.length > 0 && handoff.confirmedFacts && typeof handoff.confirmedFacts === "object" && Array.isArray(handoff.commercialLines) && Array.isArray(handoff.toolEvidence) && typeof handoff.createdAt === "string");
}

export async function signCommercialHandoff(handoff: CommercialSolutionHandoff, companyId: string) {
  return new SignJWT({ companyId, handoff })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(handoff.runtimeId)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(signingKey());
}

export async function verifyCommercialHandoff(token: string, companyId: string): Promise<CommercialSolutionHandoff> {
  const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
  if (payload.companyId !== companyId || !isHandoff(payload.handoff)) throw new Error("COMMERCIAL_HANDOFF_INVALID");
  return payload.handoff;
}
