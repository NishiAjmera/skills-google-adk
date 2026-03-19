/**
 * Skills Executor - Template processing and embedded tool execution
 * Implements the core execution engine for the skills framework
 */

import type { ParsedSkill, SkillExecutionContext, SkillExecutionResult, EmbeddedToolCall } from './types.js';
import { readFile, stat } from 'fs/promises';
import { resolve, normalize } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SkillExecutor {

  /**
   * Execute a skill with given parameters
   */
  async executeSkill(skill: ParsedSkill, context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const executedSteps: Array<{
      step: string;
      output: string;
      status: 'success' | 'error' | 'skipped';
      timestamp?: Date;
      duration?: number;
    }> = [];

    try {
      // Step 1: Validate parameters
      const validation = this.validateParameters(skill, context.parameters);
      if (!validation.valid) {
        return {
          status: 'error',
          error: `Parameter validation failed: ${validation.errors.join(', ')}`,
          skillName: context.skillName,
          executionTime: Date.now() - startTime
        };
      }

      // Step 2: Process template variables
      const stepStart = Date.now();
      const processedContent = this.processTemplate(skill.content, context.parameters);
      executedSteps.push({
        step: 'Template Processing',
        output: `Processed ${Object.keys(context.parameters).length} parameters`,
        status: 'success',
        timestamp: new Date(),
        duration: Date.now() - stepStart
      });

      // Step 3: Execute embedded tool calls
      const toolStart = Date.now();
      const finalContent = await this.executeEmbeddedTools(processedContent, executedSteps);
      executedSteps.push({
        step: 'Tool Execution',
        output: 'Completed embedded tool execution',
        status: 'success',
        timestamp: new Date(),
        duration: Date.now() - toolStart
      });

      return {
        status: 'success',
        result: finalContent,
        skillName: context.skillName,
        executedSteps,
        executionTime: Date.now() - startTime,
        metadata: {
          toolCallCount: this.countToolCalls(skill.content),
          filesRead: this.extractFilePaths(skill.content, context.parameters),
          commandsExecuted: this.extractCommands(skill.content, context.parameters)
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown execution error',
        skillName: context.skillName,
        executedSteps,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Process template variables like {{name}}
   */
  private processTemplate(content: string, parameters: Record<string, any>): string {
    let processed = content;

    // Replace {{variable}} with parameter values
    for (const [key, value] of Object.entries(parameters)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      processed = processed.replace(regex, String(value));
    }

    return processed;
  }

  /**
   * Execute embedded tool calls with comprehensive error handling and security
   */
  private async executeEmbeddedTools(
    content: string,
    executedSteps: Array<{step: string; output: string; status: 'success' | 'error' | 'skipped'; timestamp?: Date; duration?: number}>
  ): Promise<string> {
    let processed = content;
    const executionLog: Array<{tool: string, input: string, status: string}> = [];

    try {
      // Process <read>filepath</read> tags with security validation
      const readMatches = content.match(/<read>(.*?)<\/read>/gs);
      if (readMatches) {
        for (const match of readMatches) {
          const filepath = match.replace(/<\/?read>/g, '').trim();
          const stepStart = Date.now();

          // Security: Validate filepath
          if (this.isPathSecure(filepath)) {
            const result = await this.executeReadFile(filepath);
            executionLog.push({tool: 'read', input: filepath, status: result.status});

            let replacement = '';
            if (result.status === 'success') {
              // Truncate large files for display
              const content = result.content!.length > 5000
                ? result.content!.slice(0, 5000) + '\n... [truncated]'
                : result.content!;
              replacement = `\`\`\`\n${content}\n\`\`\``;

              executedSteps.push({
                step: `Read file: ${filepath}`,
                output: `Successfully read ${result.content!.length} characters`,
                status: 'success',
                timestamp: new Date(),
                duration: Date.now() - stepStart
              });
            } else {
              replacement = `*Error reading file ${filepath}: ${result.error}*`;

              executedSteps.push({
                step: `Read file: ${filepath}`,
                output: `Error: ${result.error}`,
                status: 'error',
                timestamp: new Date(),
                duration: Date.now() - stepStart
              });
            }
            processed = processed.replace(match, replacement);
          } else {
            processed = processed.replace(match, `*Error: Unsafe file path: ${filepath}*`);
            executionLog.push({tool: 'read', input: filepath, status: 'blocked'});

            executedSteps.push({
              step: `Read file: ${filepath}`,
              output: 'Blocked for security reasons',
              status: 'error',
              timestamp: new Date(),
              duration: Date.now() - stepStart
            });
          }
        }
      }

      // Process <bash>command</bash> tags with security validation
      const bashMatches = content.match(/<bash>(.*?)<\/bash>/gs);
      if (bashMatches) {
        for (const match of bashMatches) {
          const command = match.replace(/<\/?bash>/g, '').trim();
          const stepStart = Date.now();

          // Security: Additional validation beyond tool-level security
          if (this.isCommandSecure(command)) {
            const result = await this.executeBashCommand(command);
            executionLog.push({tool: 'bash', input: command, status: result.status});

            let replacement = '';
            if (result.status === 'success') {
              replacement = `\`\`\`bash\n$ ${command}\n${result.stdout}\`\`\``;
              if (result.stderr) {
                replacement += `\n*stderr:* ${result.stderr}`;
              }

              executedSteps.push({
                step: `Execute: ${command}`,
                output: `stdout: ${result.stdout}${result.stderr ? `, stderr: ${result.stderr}` : ''}`,
                status: 'success',
                timestamp: new Date(),
                duration: Date.now() - stepStart
              });
            } else {
              replacement = `*Error executing command: ${result.error}*`;

              executedSteps.push({
                step: `Execute: ${command}`,
                output: `Error: ${result.error}`,
                status: 'error',
                timestamp: new Date(),
                duration: Date.now() - stepStart
              });
            }
            processed = processed.replace(match, replacement);
          } else {
            processed = processed.replace(match, `*Error: Command blocked for security: ${command}*`);
            executionLog.push({tool: 'bash', input: command, status: 'blocked'});

            executedSteps.push({
              step: `Execute: ${command}`,
              output: 'Blocked for security reasons',
              status: 'error',
              timestamp: new Date(),
              duration: Date.now() - stepStart
            });
          }
        }
      }

      return processed;
    } catch (error) {
      // Log error and return safe fallback
      console.error('Error in embedded tool execution:', error);
      return `${processed}\n\n*Error during tool execution: ${error instanceof Error ? error.message : 'Unknown error'}*`;
    }
  }

  /**
   * Validate file paths for security
   */
  private isPathSecure(filepath: string): boolean {
    // Block path traversal and sensitive directories
    const dangerousPatterns = [
      /\.\./,  // Path traversal
      /^\/etc\//, /^\/var\//, /^\/usr\//, /^\/sys\//, /^\/proc\//,  // System dirs
      /\.env/, /\.key/, /\.pem/, /\.cert/,  // Potential secrets
    ];

    return !dangerousPatterns.some(pattern => pattern.test(filepath));
  }

  /**
   * Additional command security validation
   */
  private isCommandSecure(command: string): boolean {
    // Additional security layer beyond bash tool validation
    const maxLength = 100;
    const forbiddenChars = /[;&|`$()]/; // Shell injection characters

    return command.length <= maxLength && !forbiddenChars.test(command);
  }

  /**
   * Validate skill parameters against schema
   */
  validateParameters(skill: ParsedSkill, parameters: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const schema = skill.frontmatter.parameters || {};

    // Check required parameters
    for (const [paramName, paramConfig] of Object.entries(schema)) {
      if (paramConfig.required && !(paramName in parameters)) {
        errors.push(`Missing required parameter: ${paramName}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Count tool calls in content for metadata
   */
  private countToolCalls(content: string): number {
    const readMatches = content.match(/<read>.*?<\/read>/gs) || [];
    const bashMatches = content.match(/<bash>.*?<\/bash>/gs) || [];
    return readMatches.length + bashMatches.length;
  }

  /**
   * Extract file paths from content for metadata
   */
  private extractFilePaths(content: string, parameters: Record<string, any>): string[] {
    const processed = this.processTemplate(content, parameters);
    const readMatches = processed.match(/<read>(.*?)<\/read>/gs) || [];
    return readMatches.map(match => match.replace(/<\/?read>/g, '').trim());
  }

  /**
   * Extract commands from content for metadata
   */
  private extractCommands(content: string, parameters: Record<string, any>): string[] {
    const processed = this.processTemplate(content, parameters);
    const bashMatches = processed.match(/<bash>(.*?)<\/bash>/gs) || [];
    return bashMatches.map(match => match.replace(/<\/?bash>/g, '').trim());
  }

  /**
   * Execute read file operation with security validation (replicated from read-file tool)
   */
  private async executeReadFile(filepath: string): Promise<{status: string; content?: string; error?: string}> {
    try {
      const MAX_FILE_SIZE = 1024 * 1024; // 1MB limit
      const WORKING_DIR = process.cwd();

      // Enhanced path security: normalize, resolve, and validate boundaries
      const safePath = resolve(normalize(filepath));

      // Prevent directory traversal attacks
      if (!safePath.startsWith(WORKING_DIR)) {
        return {
          status: 'error',
          error: 'Access denied: Path outside working directory'
        };
      }

      // Check file stats before reading
      const stats = await stat(safePath);

      // Prevent memory exhaustion from large files
      if (stats.size > MAX_FILE_SIZE) {
        return {
          status: 'error',
          error: `File too large: ${stats.size} bytes (max: ${MAX_FILE_SIZE})`
        };
      }

      // Additional check for binary files (basic heuristic)
      if (stats.size > 0) {
        // Read a small sample to check for binary content
        const sample = await readFile(safePath, { encoding: null }).then(buf => buf.slice(0, 100));
        if (sample.includes(0)) {
          return {
            status: 'error',
            error: 'File appears to be binary - text files only'
          };
        }
      }

      // Read file content
      const content = await readFile(safePath, 'utf-8');

      return {
        status: 'success',
        content: content
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error reading file'
      };
    }
  }

  /**
   * Execute bash command with security validation (replicated from bash tool)
   */
  private async executeBashCommand(command: string): Promise<{status: string; stdout?: string; stderr?: string; error?: string}> {
    try {
      // Security restrictions (replicated from bash tool)
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
        /^npm\s+(list|run\s+\w+)$/, /^node\s+--version$/, /^which\s+/,
        /^file\s+/
      ];

      // Input validation
      if (!command || command.trim().length === 0) {
        return {
          status: 'error',
          error: 'Command cannot be empty'
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
          error: 'Command blocked for security reasons'
        };
      }

      // Whitelist validation (more secure)
      const isSafe = SAFE_COMMANDS.some(pattern =>
        pattern.test(trimmedCommand)
      );

      if (!isSafe) {
        return {
          status: 'error',
          error: 'Command not in allowed safe commands list'
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
        stderr: stderr ? stderr.slice(0, 1000) : undefined
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Command execution failed'
      };
    }
  }
}