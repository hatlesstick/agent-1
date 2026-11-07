import 'dotenv/config.js'
import {generateText, type ModelMessage, streamText} from 'ai'
import {openai} from "@ai-sdk/openai";
import {tools} from "./tools";
import {getTracer, Laminar} from "@lmnr-ai/lmnr";
import {executeTool} from "./executeTools.ts";
import { SYSTEM_PROMPT } from "./system/prompt.ts";
import type {AgentCallbacks, ToolCallInfo} from "../types.ts";
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
    const workingHistory = filterCompatibleMessages(conversationHistory)
    const messages: ModelMessage[] = [
        {role: 'system', content: SYSTEM_PROMPT}, ...workingHistory, {role: 'user', content: userMessage}
    ]


    let fullResponse = ""

    while (true) {
        const result = streamText({
            model: openai(MODEL_NAME),
            messages,
            tools,
            experimental_telemetry: {isEnabled: true, tracer: getTracer()},
        })

        const toolCalls: ToolCallInfo[] = []
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
                    toolCalls.push({toolCallId: chunk.toolCallId, toolName: chunk.toolName, args: input as any})
                    callbacks.onToolCallStart(chunk.toolName, input)
                }
            }
        } catch (e) {
            streamingError = e as Error
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

        if (finishReason !== 'tool-calls' || toolCalls.length === 0) {
            const responseMessages = await result.response
            messages.push(...responseMessages.messages)
            break
        }

        const responseMessages = await result.response
        messages.push(...responseMessages.messages)

        for (const tc of toolCalls) {
            const toolResult = await executeTool(tc.toolName, tc.args)
            callbacks.onToolCallEnd(tc.toolName, toolResult)
            messages.push({
                role: 'tool',
                content: [{
                    type: 'tool-result',
                    toolName: tc.toolName,
                    toolCallId: tc.toolCallId,
                    output: {type: 'text', value: toolResult}
                }]
            })
        }
    }

    callbacks.onComplete(fullResponse)

    return messages

}

