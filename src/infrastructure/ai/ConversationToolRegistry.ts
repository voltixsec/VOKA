import type { CommercialSystemResearchPort } from "@/src/application/agentic-commercial-intelligence";
import type { ConversationToolPort, ToolObservation } from "@/src/application/conversation-runtime";

export class ConversationToolRegistry implements ConversationToolPort {
  constructor(private readonly research: CommercialSystemResearchPort | null, private readonly now = () => new Date().toISOString()) {}

  async execute(input: Parameters<ConversationToolPort["execute"]>[0]): Promise<ToolObservation> {
    if (["ATTACHMENT_INSPECTION", "DRAWING_INSPECTION", "BOQ_INSPECTION"].includes(input.request.kind) && !input.request.attachmentId) return { kind: input.request.kind, status: "ATTACHMENT_REQUIRED", summary: "The referenced evidence must be attached before it can be inspected.", evidence: [], createdAt: this.now() };
    if (input.request.kind === "RESEARCH" && this.research) {
      const result = await this.research.researchSystem({ companyId: input.companyId, query: input.request.query, locale: input.locale, jurisdiction: null });
      if (result) return { kind: "RESEARCH", status: "COMPLETED", summary: [result.purpose, ...result.limitations].filter(Boolean).join(" ").slice(0, 2_000), evidence: result.evidence.map(({ title, url, publisher }) => ({ title, url, publisher })), createdAt: this.now() };
    }
    return { kind: input.request.kind, status: "UNAVAILABLE", summary: "This capability is not connected in the clean runtime yet.", evidence: [], createdAt: this.now() };
  }
}
