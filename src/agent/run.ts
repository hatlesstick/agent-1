import 'dotenv/config.js'
import {type ModelMessage, streamText} from 'ai'
import {openai} from "@ai-sdk/openai";
import {tools} from "./tools";
import {getTracer, Laminar} from "@lmnr-ai/lmnr";
import { SYSTEM_PROMPT } from "./system/prompt.ts";
import type {AgentCallbacks} from "../types.ts";

import {
    getModelLimits, isOverThreshold, calculateUsagePercentage, compactConversation, DEFAULT_THRESHOLD,
    estimateMessagesTokens
} from "./context";

import {filterCompatibleMessages} from "./system/filterMessages.ts";
import {executeTool} from "./executeTools.ts";


const MODEL_NAME = 'gpt-5-mini'

// Tools without `execute`: the SDK only returns tool calls, so we can ask for approval
// before running them ourselves. Provider tools (webSearch) are still executed by OpenAI.
const toolDefinitions = Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [name, {...t, execute: undefined}])
) as typeof tools

Laminar.initialize(({
    projectApiKey: process.env.LMNR_PROJECT_API_KEY || '',
}))

// export const runAgent = async (userMessage: string, conversationHistory: ModelMessage[], callbacks: AgentCallbacks) => {
//     const {text, toolCalls} = await generateText({
//         model: openai(MODEL_NAME),
//         // prompt: userMessage,
//         messages: [],
//         system: SYSTEM_PROMPT,
//         tools,
//         experimental_telemetry: {isEnabled: true, tracer: getTracer()},
//     })
//
//     await Laminar.flush()
//
//     toolCalls.forEach(async (toolCall) => {
//         console.log(await executeTool(toolCall.toolName, toolCall.input))
//     })
// }
//
// runAgent('Test message')

export const runAgent = async (userMessage: string, conversationHistory: ModelMessage[], callbacks: AgentCallbacks): Promise<ModelMessage[]> => {
    const modelLimits = getModelLimits(MODEL_NAME);
    // The system prompt is passed via `system` on every call, so it is never stored in the history.
    const history = filterCompatibleMessages(conversationHistory)
    let messages: ModelMessage[] = [...history, {role: 'user', content: userMessage}]
    const precheckTokens = estimateMessagesTokens(messages);
    if (isOverThreshold(precheckTokens.total, modelLimits.contextWindow)) {
        const compacted = await compactConversation(history, MODEL_NAME);
        messages = [...compacted, {role: 'user', content: userMessage}]
    }

    let fullResponse = ""

    while (true) {
        // Tools are passed without `execute`, so the SDK does not run them — we do it below after approval.
        const result = streamText({
            model: openai(MODEL_NAME),
            system: SYSTEM_PROMPT,
            messages,
            tools: toolDefinitions,
            experimental_telemetry: {isEnabled: true, tracer: getTracer()},
        })
        const reportTokenUsage = async () => {
            if (callbacks.onTokenUsage) {
                const usage = estimateMessagesTokens(messages)
                callbacks.onTokenUsage({
                    inputTokens: usage.input,
                    outputTokens: usage.output,
                    totalTokens: usage.total,
                    contextWindow: modelLimits.contextWindow,
                    threshold: DEFAULT_THRESHOLD,
                    percentage: calculateUsagePercentage(usage.total, modelLimits.contextWindow)
                })
            }
        }
        let currentText = ""
        let streamingError: Error | null = null

        try {
            for await (const chunk of result.fullStream) {
                if (chunk.type === 'text-delta') {
                    currentText += chunk.text
                    callbacks.onToken(chunk.text)
                }

                if (chunk.type === 'tool-call') {
                    const input = 'input' in chunk ? chunk.input : {}
                    callbacks.onToolCallStart(chunk.toolName, input)
                }

                // Only provider-executed tools (webSearch) produce results inside the stream now.
                if (chunk.type === 'tool-result') {
                    callbacks.onToolCallEnd(chunk.toolName, String(chunk.output))
                }
            }
        } catch (e) {
            streamingError = e instanceof Error ? e : new Error(String(e))
            if (!currentText && !streamingError.message.includes('No output generated')) {
                throw streamingError
            }
        }

        fullResponse += currentText

        if (streamingError && !currentText) {
            fullResponse = 'Sorry about that, I encountered an error while generating a response. Please try again later.'
            callbacks.onToken(fullResponse)

            break;
        }

        const finishReason = await result.finishReason
        // Response messages contain the assistant message with tool calls (and provider tool results).
        const responseMessages = await result.response
        messages.push(...responseMessages.messages)
        reportTokenUsage()
        if (finishReason !== 'tool-calls') {
            break
        }

        // Local tool calls that we have to approve and execute ourselves
        const toolCalls = (await result.toolCalls).filter((tc) => !tc.providerExecuted)

        // Process tool calls sequentially with approval for each
        let rejected = false
        for (const tc of toolCalls) {
            const approved = rejected ? false : await callbacks.onToolApproval(tc.toolName, tc.input)

            if (!approved) {
                rejected = true
            }

            // Every tool call needs a matching tool result, otherwise the API rejects the next request
            const output = approved
                ? await executeTool(tc.toolName, tc.input)
                : 'The user rejected this tool call.'

            callbacks.onToolCallEnd(tc.toolName, output)

            messages.push({
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: tc.toolCallId,
                        toolName: tc.toolName,
                        output: {type: 'text', value: output},
                    },
                ],
            })
            reportTokenUsage()
        }

        if (rejected) {
            break
        }
    }

    callbacks.onComplete(fullResponse)

    return messages

}
