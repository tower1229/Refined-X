export type ChatCompletionMessage = {
  content?: unknown;
  reasoning_content?: unknown;
};

/**
 * Extract the public answer text from a chat-completion message.
 * Only `content` is accepted as a final answer; `reasoning_content` is never used.
 */
export function messageText(message: ChatCompletionMessage | undefined): string {
  if (typeof message?.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  if (Array.isArray(message?.content)) {
    const joined = message.content
      .map((part) =>
        part && typeof part === "object" && "text" in part && typeof part.text === "string"
          ? part.text
          : "",
      )
      .join("")
      .trim();
    if (joined) return joined;
  }
  return "";
}
