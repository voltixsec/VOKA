import type { ConversationLocale, ConversationToolKind, ConversationTurnInput, ToolRequest } from "./types";

export const MAX_TURN_MESSAGE_LENGTH = 4_000;

export type AttachmentTurnResolution =
  | { kind: "USER_MESSAGE"; message: string }
  | { kind: "ATTACHMENT_ANALYSIS"; message: ""; attachmentId: string; inspection: ToolRequest }
  | { kind: "INVALID"; code: "CONVERSATION_RUNTIME_MESSAGE_INVALID" };

/**
 * Deterministic inspection kind for an attachment-only turn. Images can only be retained (STORED_PENDING_VISION);
 * a PDF is read as a bounded BOQ/text inspection. Drawing visual analysis is never implied.
 */
export function attachmentInspectionKind(mimeType: string): Extract<ConversationToolKind, "ATTACHMENT_INSPECTION" | "BOQ_INSPECTION"> {
  return mimeType.toLowerCase() === "application/pdf" ? "BOQ_INSPECTION" : "ATTACHMENT_INSPECTION";
}

/**
 * Resolves what a turn is. Text (with or without attachment) is a USER_MESSAGE; an attachment with a server-issued id
 * and no text is an explicit ATTACHMENT_ANALYSIS turn. No user prose is ever synthesized: the runtime keeps the
 * user message empty and carries the intent as structured data.
 */
export function resolveTurnIntent(input: Pick<ConversationTurnInput, "message" | "attachment" | "action">): AttachmentTurnResolution {
  const message = input.message.trim();
  if (message.length > MAX_TURN_MESSAGE_LENGTH) return { kind: "INVALID", code: "CONVERSATION_RUNTIME_MESSAGE_INVALID" };
  if (message) return { kind: "USER_MESSAGE", message };
  const attachmentId = input.attachment?.id?.trim();
  if (input.action === "RECONCILE" || !attachmentId || !input.attachment) return { kind: "INVALID", code: "CONVERSATION_RUNTIME_MESSAGE_INVALID" };
  const kind = attachmentInspectionKind(input.attachment.type);
  return { kind: "ATTACHMENT_ANALYSIS", message: "", attachmentId, inspection: { kind, query: attachmentAnalysisQuery(kind), attachmentId } };
}

/** Bounded internal instruction; it is tool context, never a user utterance. */
export function attachmentAnalysisQuery(kind: "ATTACHMENT_INSPECTION" | "BOQ_INSPECTION") {
  return kind === "BOQ_INSPECTION"
    ? "Attachment-only turn: read the retained machine-readable text and list reviewable BOQ candidates only. Do not approve quantities or invent content."
    : "Attachment-only turn: confirm the retained attachment and report its honest processing status only.";
}

/** Timeline label for an attachment-only user turn; explicitly not user prose. */
export function attachmentTurnLabel(locale: ConversationLocale, attachmentName: string) {
  return locale === "ar" ? `📎 مرفق: ${attachmentName}` : `📎 Attachment: ${attachmentName}`;
}
