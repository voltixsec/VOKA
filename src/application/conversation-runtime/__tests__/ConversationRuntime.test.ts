import { describe, expect, it } from "vitest";
import { ConversationRuntime } from "../ConversationRuntime";
import type { ConversationBrainDecision, ConversationBrainPort, ConversationToolPort } from "../index";

const baseDecision = (reply: string): ConversationBrainDecision => ({ reply, factProposals: [], unresolvedImportantQuestions: [], toolRequest: null, solutionReadiness: "EXPLORING", transition: "NONE", compactMemory: "", suggestedReplies: [] });
const ids = () => { let value = 0; return () => `id-${++value}`; };
const tools: ConversationToolPort = { execute: async ({ request }) => ({ kind: request.kind, status: request.kind === "RESEARCH" ? "COMPLETED" : "ATTACHMENT_REQUIRED", summary: "Evidence observed", evidence: [], createdAt: "2026-01-01T00:00:00.000Z" }) };
const execute = (brain: ConversationBrainPort, message: string, state: any = null) => new ConversationRuntime(brain, tools, () => "2026-01-01T00:00:00.000Z", ids()).execute({ state, message, locale: "ar", source: "TEXT", companyId: "company-1" });

describe("clean ConversationRuntime", () => {
  it("shows the AI brain reply verbatim and cannot be replaced by legacy missing-field guidance", async () => {
    const reply = "فكرة ممتازة. مصعد السيارات له أكثر من تكوين، ونقدر نحدد نقطة بداية مناسبة حسب نوع السيارات وعدد الوقفات. هل الاستخدام لسيارات عادية فقط أم SUV أيضًا؟";
    const state = await execute({ decide: async () => ({ ...baseDecision(reply), factProposals: [{ key: "system.identity", value: "مصعد سيارات", provenance: "USER_EXPLICIT", evidence: "مصعد سيارات" }] }) }, "عايز أعمل عرض سعر لمصعد سيارات", { runtimeId: "clean", version: 1, locale: "ar", messages: [], confirmedFacts: {}, candidateFacts: [], unresolvedImportantQuestions: ["legacy.payment", "legacy.load", "legacy.customer"], toolResults: [], solutionReadiness: "EXPLORING", transitionState: "EXPLORING", compactMemory: "", suggestedReplies: [], handoff: null });
    expect(state.messages.at(-1)?.text).toBe(reply);
    expect(state.messages.at(-1)?.text).not.toMatch(/تم تحديث الطلب|الدفع|العميل/);
    expect(state.confirmedFacts["system.identity"].value).toBe("مصعد سيارات");
  });

  it.each(["مش عارف", "اختارلي", "إيه رأيك؟", "ساعدني", "إيه المتاح؟", "I don't know", "What do you recommend?"])("never commits non-value guidance as engineering truth: %s", async (message) => {
    const state = await execute({ decide: async () => ({ ...baseDecision("خليني أساعدك نختار نقطة بداية آمنة."), factProposals: [{ key: "system.capacity", value: message, provenance: "USER_EXPLICIT", evidence: message }] }) }, message);
    expect(state.confirmedFacts["system.capacity"]).toBeUndefined();
    expect(state.candidateFacts.at(-1)?.rejectionReason).toBe("FACT_VALUE_INVALID");
  });

  it("adapts to a drawing mention and runs the selected typed tool before the AI continuation", async () => {
    let calls = 0;
    const brain: ConversationBrainPort = { decide: async (input) => {
      calls++;
      if (!input.toolResults.length) return { ...baseDecision(""), toolRequest: { kind: "DRAWING_INSPECTION", query: "inspect vehicle elevator drawing", attachmentId: null } };
      return { ...baseDecision("ممتاز، الرسمة هتساعدنا نراجع أبعاد البئر والفتحات. ارفعها هنا وأنا أستخدمها في التكوين."), unresolvedImportantQuestions: ["drawing attachment"] };
    } };
    const state = await execute(brain, "على فكرة عندي رسمة");
    expect(calls).toBe(2);
    expect(state.toolResults.at(-1)?.status).toBe("ATTACHMENT_REQUIRED");
    expect(state.messages.at(-1)?.text).toContain("ارفعها");
  });

  it("records transition intent without creating a handoff or navigating from natural confirmation", async () => {
    const first = await execute({ decide: async () => ({ ...baseDecision("الحل المبدئي أصبح واضحًا. تحب نغيّر شيئًا أم نبدأ تجهيز العرض؟"), solutionReadiness: "AWAITING_USER_CONFIRMATION", transition: "PROPOSE", factProposals: [{ key: "system.identity", value: "Vehicle Elevator", provenance: "USER_EXPLICIT", evidence: "مصعد سيارات" }] }) }, "مصعد سيارات");
    expect(first.transitionState).toBe("PROPOSED");
    expect(first.handoff).toBeNull();
    const second = await execute({ decide: async () => ({ ...baseDecision("تمام، هنقل الحل المؤكد لتجهيز العرض."), solutionReadiness: "READY_FOR_HANDOFF", transition: "CONFIRM" }) }, "تمام نبدأ", first);
    expect(second.transitionState).toBe("TRANSITION_REQUESTED");
    expect(second.handoff).toBeNull();
    expect(second.handoffToken).toBeNull();
  });

  it("rejects AI and research proposals from confirmed truth until user confirmation", async () => {
    const state = await execute({ decide: async () => ({ ...baseDecision("أقدر أقترح حمولة مبدئية، لكن نثبتها بعد بيانات المشروع."), factProposals: [{ key: "system.capacity", value: 3000, provenance: "AI_INFERRED", evidence: "recommendation" }] }) }, "إنت شوف الأنسب");
    expect(state.confirmedFacts["system.capacity"]).toBeUndefined();
    expect(state.candidateFacts.at(-1)?.rejectionReason).toBe("REQUIRES_USER_CONFIRMATION");
  });

  it("uses the identical runtime path for voice and text messages", async () => {
    const seen: string[] = [];
    const brain: ConversationBrainPort = { decide: async ({ currentMessage }) => { seen.push(currentMessage); return baseDecision("نفس الفهم، أيًا كانت وسيلة الإدخال."); } };
    const runtime = new ConversationRuntime(brain, tools, () => "2026-01-01T00:00:00.000Z", ids());
    const text = await runtime.execute({ state: null, message: "مصعد سيارات", locale: "ar", source: "TEXT", companyId: "company-1" });
    const voice = await runtime.execute({ state: null, message: "مصعد سيارات", locale: "ar", source: "VOICE", companyId: "company-1" });
    expect(seen).toEqual(["مصعد سيارات", "مصعد سيارات"]);
    expect(text.messages.at(-1)?.text).toBe(voice.messages.at(-1)?.text);
    expect(voice.messages[0].source).toBe("VOICE");
  });

  it("keeps recent context available for recommendations and mid-conversation direction changes", async () => {
    const histories: string[][] = [];
    const brain: ConversationBrainPort = { decide: async (input) => {
      histories.push(input.recentMessages.map((message) => message.text));
      if (input.currentMessage === "إيه رأيك؟") return baseDecision("أنسب بداية هنا تكوين يستوعب SUV، بشرط مراجعة أبعاد البئر قبل اعتماد الحمولة.");
      if (input.currentMessage.includes("بدل")) return baseDecision("تمام، هنغيّر الاتجاه لنظام كاميرات ونترك المصعد خارج الحل الحالي.");
      return baseDecision("خلينا نبني الحل خطوة بخطوة.");
    } };
    const first = await execute(brain, "عايز مصعد سيارات");
    const opinion = await execute(brain, "إيه رأيك؟", first);
    const changed = await execute(brain, "لا، خلّيه نظام كاميرات بدل المصعد", opinion);
    expect(opinion.messages.at(-1)?.text).toContain("SUV");
    expect(changed.messages.at(-1)?.text).toContain("نغيّر الاتجاه");
    expect(histories.at(-1)).toEqual(expect.arrayContaining(["عايز مصعد سيارات", "إيه رأيك؟", "لا، خلّيه نظام كاميرات بدل المصعد"]));
  });
});
