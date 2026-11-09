import 'dotenv/config.js'
import {type ModelMessage, streamText} from 'ai'
import {openai} from "@ai-sdk/openai";
import {tools} from "./tools";
import {getTracer, Laminar} from "@lmnr-ai/lmnr";
import { SYSTEM_PROMPT } from "./system/prompt.ts";
import type {AgentCallbacks} from "../types.ts";
import {filterCompatibleMessages} from "./system/filterMessages.ts";

const MODEL_NAME = 'gpt-5-mini'

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
    // The system prompt is passed via `system` on every call, so it is never stored in the history.
    const messages: ModelMessage[] = [
        ...filterCompatibleMessages(conversationHistory), {role: 'user', content: userMessage}
    ]

    let fullResponse = ""

    while (true) {
        // The AI SDK executes tools that have an `execute` function itself, so we do not run them manually here.
        const result = streamText({
            model: openai(MODEL_NAME),
            system: SYSTEM_PROMPT,
            messages,
            tools,
            experimental_telemetry: {isEnabled: true, tracer: getTracer()},
        })

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
        // Response messages already contain the assistant message and the executed tool results.
        const responseMessages = await result.response
        messages.push(...responseMessages.messages)

        if (finishReason !== 'tool-calls') {
            break
        }
    }

    callbacks.onComplete(fullResponse)

    return messages

}
