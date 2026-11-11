import {tool} from "ai";
import {z} from "zod";
import shell from "shelljs";

export const runCommand = tool({
  description: "Execute a shell command and return its output. Use this tool for tasks that require executing shell commands.",
  inputSchema: z.object({
    command: z.string().describe("The shell command to run"),
  }),
  execute: async ({ command }) => {
    const result = shell.exec(command, { silent: true });
    let output = ''
    if (result.stdout) {
        output += result.stdout
    }

    if (result.stderr) {
        output += result.stderr
    }

    if (result.code !== 0) {
      return `Command failed with exit code ${result.code}. Output: ${output}`;
    }
    return output || 'Command executed successfully with no output.';
  },
});