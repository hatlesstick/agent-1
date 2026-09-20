import 'dotenv/config.js'
import { generateText, type ModelMessage } from 'ai'
import {openai} from "@ai-sdk/openai";
import {tools} from "./tools";
import {executeTool} from "./executeTools.ts";
import { SYSTEM_PROMPT } from "./system/prompt.ts";
import type {AgentCallbacks} from "../types.ts";
const MODEL_NAME = 'gpt-5-mini'

export const runAgent = async (userMessage: string, conversationHistory: ModelMessage[], callbacks: AgentCallbacks) => {
    const {text, toolCalls} = await generateText({
        model: openai(MODEL_NAME),
        prompt: userMessage,
        system: SYSTEM_PROMPT,
        tools,
    })

    console.log(text, toolCalls)

    toolCalls.forEach(async (toolCall) => {
        console.log(await executeTool(toolCall.toolName, toolCall.input))
    })
}

runAgent('Test message')
