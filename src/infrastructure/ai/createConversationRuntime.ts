import { ConversationRuntime } from "@/src/application/conversation-runtime";
import { ConversationToolRegistry } from "./ConversationToolRegistry";
import { OpenAIConversationBrain } from "./openai/OpenAIConversationBrain";
import { OpenAISalesAssistantAdapter } from "./openai/OpenAISalesAssistantAdapter";
import { PrismaSolutionCandidateResolver } from "./PrismaSolutionCandidateResolver";

export function createConversationRuntime() {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.VOKA_SALES_AI_MODEL;
  if (!key || !model || (process.env.VOKA_AI_PROVIDER && process.env.VOKA_AI_PROVIDER.toLowerCase() !== "openai")) return null;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const brain = new OpenAIConversationBrain(key, model, baseUrl);
  const research = process.env.VOKA_COMMERCIAL_RESEARCH_ENABLED === "false" ? null : new OpenAISalesAssistantAdapter(key, process.env.VOKA_COMMERCIAL_RESEARCH_MODEL?.trim() || model, baseUrl, { enabled: true });
  return new ConversationRuntime(brain, new ConversationToolRegistry(research), undefined, undefined, new PrismaSolutionCandidateResolver(research));
}
