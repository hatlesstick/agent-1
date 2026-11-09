import { generateText, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { extractMessageText } from "./tokenEstimator.ts";

const SUMMARIZATION_PROMPT = ` You are a helpful assistant that summarizes conversations. Given the following conversation, produce a concise summary that captures the key points and context. The summary should be clear and informative, suitable for someone who has not seen the original conversation.
1. Key decisions and conclusions reached
2. Important context and facts mentioned
3. Any pending tasks or questions
4. The overall goal of the conversation

Be concise but complete. The summary should allow the conversation to continue naturally.

Conversation to summarize:
`;

/**
 * Format messages array as readable text for summarization
 */
function messagesToText(messages: ModelMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.role.toUpperCase();
      const content = extractMessageText(msg);
      return `[${role}]: ${content}`;
    })
    .join("\n\n");
}

/**
 * Compact a conversation by summarizing it with an LLM.
 *
 * Takes the current messages (excluding system prompt) and returns a new
 * messages array with:
 * - A user message containing the summary
 * - An assistant acknowledgment
 *
 * The system prompt should be prepended by the caller.
 */
export async function compactConversation(
  messages: ModelMessage[],
  model: string = "gpt-5-mini",
): Promise<any> {
  const conversationMessages = messages.filter(m => m.role !== "system");
  if (conversationMessages.length === 0) {
    return []; // Nothing to summarize
  }

  const conversationText = messagesToText(conversationMessages);
  const { text: summary } = await generateText({
      model: openai(model),
      prompt: SUMMARIZATION_PROMPT + conversationText
  })

    const compactedMessages: ModelMessage[] = [
        {role: 'user', content: `[CONVERSATION SUMMARY]: ${summary}`},
        {role: 'assistant', content: 'Acknowledged. Summary received. How can I assist you further?'}
    ]

    return compactedMessages;
}
