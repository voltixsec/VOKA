// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildSystemConfigurationGraph, type ConfirmedFact } from "@/src/application/conversation-runtime";
import { MessageBubble, plainConversationText } from "../MessageBubble";
import { SolutionWorkspace } from "../SolutionWorkspace";

const fact = (key: string, value: string | number, provenance: ConfirmedFact["provenance"] = "USER_EXPLICIT"): ConfirmedFact => ({ key, value, provenance, evidence: String(value), updatedAt: "2026-08-31T00:00:00.000Z" });

describe("conversation presentation", () => {
  it("forces assistant markdown into clean conversational plain text", () => {
    expect(plainConversationText("**Choice**\n| Model | Brand |\n| --- | --- |\n`M-1`")).toBe("Choice\nModel · Brand\n\nM-1");
    render(<MessageBubble role="ASSISTANT" text="**Choice** | Model" isArabic={false} />);
    expect(screen.getByText("Choice · Model")).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it("localizes Arabic readiness statuses and ceramic units without changing internal enums", () => {
    const graph = buildSystemConfigurationGraph({
      "system.identity": fact("system.identity", "سيراميك أرضيات"), "system.jurisdiction": fact("system.jurisdiction", "الكويت"),
      "customer.name": fact("customer.name", "شركة الاختبار"), "system.areaM2": fact("system.areaM2", 450), "system.tileSize": fact("system.tileSize", "60x60"),
      "ceramic.adhesiveBags": fact("ceramic.adhesiveBags", 100, "USER_APPROVED"), "ceramic.groutKg": fact("ceramic.groutKg", 200, "USER_APPROVED"),
      "ceramic.skirtingLm": fact("ceramic.skirtingLm", 132, "USER_APPROVED"),
    });
    const { container } = render(<SolutionWorkspace graph={graph} isArabic onOpenDraft={vi.fn()} draftLoading={false} />);
    const text = container.textContent ?? "";
    expect(text).toContain("كيس"); expect(text).toContain("كجم"); expect(text).toContain("متر طولي"); expect(text).toContain("التسعير"); expect(text).toContain("شروط الدفع");
    expect(text).not.toMatch(/\b(?:Customer|Quantity|Pricing|Payment terms|bag|kg|lm)\b/);
  });
});
