import type {
  EvalData,
  SingleTurnResult,
  MultiTurnEvalData,
  MultiTurnResult,
} from "./types.ts";


import {generateText, type ModelMessage, stepCountIs, tool, type ToolSet} from "ai";
import {openai} from "@ai-sdk/openai";
import z from "zod";
import {buildMessages, buildMockedTools} from "./utils.ts";
import {SYSTEM_PROMPT} from "../src/agent/system/prompt.ts";

const TOOL_DEFINITION: any = {
  readFile: {
    description: "Read the content of file at the specified path",
    parameters: z.object({
      path: z.string().describe('The path to the file to read'),
    })
  },
  writeFile: {
    description: "Write content to a file at the specified path",
    parameters: z.object({
      path: z.string().describe('The path to the file to write'),
      content: z.string().describe('The content to write to the file'),
    })
  },
  listFiles: {
    description: "List files in a directory",
    parameters: z.object({
      path: z.string().describe('The path to the directory to list'),
    })
  },
  deleteFile: {
    description: "Delete a file at the specified path",
    parameters: z.object({
      path: z.string().describe('The path to the file to delete'),
    })
  },
  runCommand: {
    description: "Run a shell command",
    parameters: z.object({
      command: z.string().describe('The command to run'),
    })
  }
}


export const singleTurnExecutorWithMocks = async (data: EvalData) => {
  const messages = buildMessages(data)

  const tools: ToolSet = {

  }

  for (const toolName of data.tools) {
    const def = TOOL_DEFINITION[toolName as keyof typeof TOOL_DEFINITION]

    if (def) {
        tools[toolName] = tool({
            description: def.description,
          inputSchema: def.parameters,
        })
    }
  }

  const { toolCalls }  = await generateText({
    model: openai(data.config?.model ?? 'gpt-5-mini-2025-08-07'),
    messages,
    tools,
    stopWhen: stepCountIs(1),
    temperature: data.config?.temperature ?? undefined,
    providerOptions: {
      openai: {
        reasoningEffort: 'high'
      }
    }
  })

  const calls = toolCalls.map((call) => ({
    toolName: call.toolName,
    args: call.input,
  }))

  const toolNames = toolCalls.map((call) => call.toolName)

  return {
    toolCalls: calls,
    toolNames,
    selectedAny: toolNames.length > 0
  } satisfies SingleTurnResult
}


export const multiTurnExecutorWithMocks = async (data: MultiTurnEvalData) => {
  const tools = buildMockedTools(data.mockTools)

  const messages: ModelMessage[] = data.messages ?? [
    {role: 'system', content: SYSTEM_PROMPT},
    {role: 'user', content: data.prompt!}
  ]

  const result   = await generateText({
    model: openai(data.config?.model ?? 'gpt-5-mini-2025-08-07'),
    messages,
    tools,
    stopWhen: stepCountIs(data.config?.maxSteps ?? 20)
  })

  const allTools: string[] = []
  const steps = result.steps.map((step) => {
    const stepToolCalls = (step.toolCalls ?? []).map((toolCall) => {
      allTools.push(toolCall.toolName)

      return {
        toolName: toolCall.toolName,
        args: toolCall.input,
      }
    })

    const stepToolResults = (step.toolResults ?? []).map((toolResult) => ({
      toolName: toolResult.toolName,
      result: 'output' in toolResult ? toolResult.output : undefined,
    }))

    return {
      toolCalls: stepToolCalls.length > 0 ? stepToolCalls : undefined,
      toolResults: stepToolResults.length > 0 ? stepToolResults : undefined,
      text: step.text || undefined,
    }
  })

  return {
    text: result.text,
    steps,
    toolsUsed: [...new Set(allTools)],
    toolCallOrder: allTools,
  } satisfies MultiTurnResult
}