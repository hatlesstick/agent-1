import {tool} from "ai";
import {z} from 'zod'
import fs from "node:fs/promises";
import nodePath from "node:path";

export const readFile = tool({
    description: 'Read the full content of the file at the specified path, use this always before any file content related task',
    inputSchema: z.object({
        path: z.string().describe('The path to the file to read'),
    }),
    execute: async ({ path }) => {
        try {
            const content = await fs.readFile(path, 'utf-8')
            return content
        } catch (e) {
            return `Error reading file at ${path}: ${(e as Error).message}`
        }
    }
})

export const writeFile = tool({
    description: 'Write content to a file at the specified path, creates the file if it does not exist',
    inputSchema: z.object({
        path: z.string().describe('The path to the file to write'),
        content: z.string().describe('The content to write to the file'),
    }),
    execute: async ({ path, content }) => {
        try {
            const dir = nodePath.dirname(path)
            await fs.mkdir(dir, { recursive: true })
            await fs.writeFile(path, content, 'utf-8')
            return `File written successfully at ${path}`
        } catch (e) {
            return `Error writing file at ${path}: ${(e as Error).message}`
        }
    }
})

export const listFiles = tool({
    description: 'List all files and directories in the specified directory path',
    inputSchema: z.object({
        directory: z.string().describe('The directory path to list contents of').default('.'),
    }),
    execute: async ({ directory }) => {
        try {
            const files = await fs.readdir(directory, { withFileTypes: true })
            const items = files.map(file => {
                const type = file.isDirectory() ? '[dir]' : '[file]'
                return `${type} ${file.name}`
            })
            return items.length > 0 ? items.join('\n') : `No files found in directory ${directory}`
        } catch (e) {
            return `Error listing files in directory ${directory}: ${(e as Error).message}`
        }
    }
    })


export const deleteFile = tool({
    description: 'Delete a file at the specified path, use with caution as this is irreversible',
    inputSchema: z.object({
        path: z.string().describe('The path to the file to delete'),
    }),
    execute: async ({ path }) => {
        try {
            await fs.unlink(path)
            return `File deleted successfully at ${path}`
        } catch (e) {
            return `Error deleting file at ${path}: ${(e as Error).message}`
        }
    }
})