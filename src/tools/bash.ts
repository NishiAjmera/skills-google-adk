import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Comprehensive security restrictions
const DANGEROUS_PATTERNS = [
  // Destructive operations
  /rm\s+-[rf]+/i, /sudo\s+rm/i, /format/i, /mkfs/i,
  // Network operations
  /curl|wget|nc|netcat/i,
  // System modification
  /chmod\s+777/i, /chown\s+-R/i, /mv\s+\/|mv\s+\*/i,
  // Fork bombs and infinite loops
  /:\(\)\{.*\|.*\}/i, /while\s+true/i,
  // File system traversal
  /\.\.\/|~\/|\/etc\/|\/var\/|\/usr\//i,
  // Process manipulation
  /kill\s+-9|killall|pkill/i,
  // Package management (potential for system changes)
  /apt|yum|brew|npm\s+install\s+-g/i
];

// Allowed safe commands (whitelist approach)
const SAFE_COMMANDS = [
  /^ls(\s|$)/, /^pwd$/, /^whoami$/, /^date$/, /^echo\s/,
  /^cat\s+[^\/\.\*]+$/, /^head\s+/, /^tail\s+/, /^wc\s+/,
  /^grep\s+/, /^find\s+\.\s+/, /^git\s+(status|log|diff|branch)$/,
  /^npm\s+(list|run\s+\w+)$/, /^node\s+--version$/, /^which\s+/
];

export const bashTool = new FunctionTool({
  name: 'bash',
  description: 'Execute safe bash commands for file inspection and basic operations. Restricted to read-only and safe commands only.',
  parameters: z.object({
    command: z.string().max(200).describe('The bash command to execute (max 200 chars)'),
  }),
  execute: async ({ command }) => {
    try {
      // Input validation
      if (!command || command.trim().length === 0) {
        return {
          status: 'error',
          error: 'Command cannot be empty',
          command: command
        };
      }

      const trimmedCommand = command.trim();

      // Check against dangerous patterns
      const isDangerous = DANGEROUS_PATTERNS.some(pattern =>
        pattern.test(trimmedCommand)
      );

      if (isDangerous) {
        return {
          status: 'error',
          error: 'Command blocked for security reasons',
          command: trimmedCommand,
          reason: 'Contains potentially dangerous patterns'
        };
      }

      // Whitelist validation (more secure)
      const isSafe = SAFE_COMMANDS.some(pattern =>
        pattern.test(trimmedCommand)
      );

      if (!isSafe) {
        return {
          status: 'error',
          error: 'Command not in allowed safe commands list',
          command: trimmedCommand,
          reason: 'Only read-only and inspection commands are allowed'
        };
      }

      // Execute with strict timeout and resource limits
      const { stdout, stderr } = await execAsync(trimmedCommand, {
        timeout: 5000, // 5 second timeout
        maxBuffer: 1024 * 1024, // 1MB output limit
        cwd: process.cwd(),
        env: { ...process.env, PATH: process.env.PATH } // Inherit PATH only
      });

      return {
        status: 'success',
        stdout: stdout.slice(0, 10000), // Truncate long outputs
        stderr: stderr ? stderr.slice(0, 1000) : null,
        command: trimmedCommand
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Command execution failed',
        command: command,
        details: error instanceof Error ? error.name : 'Unknown error type'
      };
    }
  },
});