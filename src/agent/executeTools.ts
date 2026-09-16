import {tools} from "./tools";
export type Toolname = keyof typeof tools;
export const executeTool = async (toolName: string, args: any) => {
    const tool= tools[toolName as Toolname];
    if (!tool) {
        return 'Unknown tool, this is not exist';
    }

    const execute = tool.execute;
    if (!execute) {
        return 'Tool does not have an execute function';
    }

    const result = await execute(args, {toolCallId: '', messages: []});
    return String(result);
}