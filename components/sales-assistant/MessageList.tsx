import { forwardRef, type ReactNode } from "react";
import { AssistantIcon } from "./AssistantIcon";
import { MessageBubble } from "./MessageBubble";

type Props = {
  messages: Array<{ role: "USER" | "ASSISTANT"; text: string }>;
  pendingUserMessage: string | null;
  isArabic: boolean;
  copiedMessage: number | null;
  onCopy: (text: string, index: number) => void;
  onScroll: () => void;
  showLatest: boolean;
  onLatest: () => void;
  latestAssistantContent?: ReactNode;
  activity?: ReactNode;
};

export const MessageList = forwardRef<HTMLElement, Props>(function MessageList({ messages, pendingUserMessage, isArabic, copiedMessage, onCopy, onScroll, showLatest, onLatest, latestAssistantContent, activity }, ref) {
  const latestAssistant = messages.map((turn) => turn.role ?? "USER").lastIndexOf("ASSISTANT");
  return <section ref={ref} onScroll={onScroll} data-testid="conversation-timeline" aria-label={isArabic ? "المحادثة" : "Conversation"} className="min-h-0 flex-1 space-y-6 overflow-y-auto scroll-smooth px-1 py-5 [scrollbar-gutter:stable] sm:px-2 sm:py-7">
    {messages.map((turn, index) => {
      const role = (turn.role ?? "USER") as "USER" | "ASSISTANT";
      return <MessageBubble key={`${index}-${turn.text.slice(0, 20)}`} role={role} text={turn.text} isArabic={isArabic} copied={copiedMessage === index} onCopy={role === "ASSISTANT" ? () => onCopy(turn.text, index) : undefined}>
        {role === "ASSISTANT" && index === latestAssistant ? latestAssistantContent : null}
      </MessageBubble>;
    })}
    {pendingUserMessage ? <MessageBubble role="USER" text={pendingUserMessage} isArabic={isArabic} pending /> : null}
    {activity}
    {showLatest ? <button type="button" onClick={onLatest} className="sticky bottom-3 mx-auto flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/95 px-3.5 py-2 text-xs text-slate-300 shadow-2xl backdrop-blur-xl outline-none focus-visible:ring-2 focus-visible:ring-sky-400"><AssistantIcon name="latest" className="h-4 w-4" />{isArabic ? "أحدث رسالة" : "Latest message"}</button> : null}
  </section>;
});
