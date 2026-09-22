import type {
  EvalData,
  SingleTurnResult,
  MultiTurnEvalData,
  MultiTurnResult,
} from "./types.ts";


import {generateText, stepCountIs, tool, type ToolSet} from "ai";
import {openai} from "@ai-sdk/openai";
import z from "zod";
import {buildMessages} from "./utils.ts";

const TOOL_DEFINITION: any = {
  readFile: {
    description: "Read the content of file at the specified path",
    parameters: z.object({
      path: z.string().description('The path to the file to read'),
    })
  },
  writeFile: {
    description: "Write content to a file at the specified path",
    parameters: z.object({
      path: z.string().description('The path to the file to write'),
      content: z.string().description('The content to write to the file'),
    })
  },
  listFiles: {
    description: "List files in a directory",
    parameters: z.object({
      path: z.string().description('The path to the directory to list'),
    })
  },
  deleteFile: {
    description: "Delete a file at the specified path",
    parameters: z.object({
      path: z.string().description('The path to the file to delete'),
    })
  },
  runCommand: {
    description: "Run a shell command",
    parameters: z.object({
      command: z.string().description('The command to run'),
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
        tools[toolName as keyof typeof TOOL_DEFINITION] = tool({
            description: def.description,
          inputSchema: def.parameters,
        })
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
      args: 'args' in call ? call.args : {},
    }))

    const toolNames = toolCalls.map((call) => call.toolName)

    return {
      toolCalls,
      toolNames,
      selectedAny: toolNames.length > 0
    }
  }
}