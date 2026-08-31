import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const runtimeEntryPoints = [
  "app/dashboard/sales-assistant/page.tsx",
  "app/api/ai/conversation-runtime/route.ts",
  "app/api/ai/conversation-runtime/quotation-draft/route.ts",
  "src/application/conversation-runtime/ConversationRuntime.ts",
  "src/application/conversation-runtime/quotation-handoff.ts",
];

describe("clean Conversation Runtime isolation", () => {
  it.each(runtimeEntryPoints)("does not reconnect legacy conversation ownership in %s", (file) => {
    const source = readFileSync(resolve(root, file), "utf8");
    expect(source).not.toMatch(/CompleteCommercialConversation|field-completion|activeQuestion|chat-first-response|legacy response/i);
  });
});
