import { SignJWT, jwtVerify } from "jose";
import type { ConversationRuntimeState } from "@/src/application/conversation-runtime";

const ISSUER = "voka-conversation-runtime";
const AUDIENCE = "voka-conversation-state";

function signingKey() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error("CONVERSATION_STATE_SIGNING_NOT_CONFIGURED");
  return new TextEncoder().encode(secret);
}

function unsigned(state: ConversationRuntimeState): ConversationRuntimeState {
  return { ...state, stateToken: null, handoffToken: null };
}

function isState(value: unknown): value is ConversationRuntimeState {
  const state = value as Partial<ConversationRuntimeState> | null;
  return Boolean(state && state.version === 1 && typeof state.runtimeId === "string" && Array.isArray(state.messages) && state.confirmedFacts && typeof state.confirmedFacts === "object" && Array.isArray(state.candidateFacts));
}

export async function signConversationState(state: ConversationRuntimeState, companyId: string) {
  return new SignJWT({ companyId, state: unsigned(state) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER).setAudience(AUDIENCE).setSubject(state.runtimeId).setIssuedAt().setExpirationTime("24h").sign(signingKey());
}

export async function verifyConversationState(token: string, companyId: string): Promise<ConversationRuntimeState> {
  const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
  if (payload.companyId !== companyId || !isState(payload.state)) throw new Error("CONVERSATION_STATE_INVALID");
  return payload.state;
}
