import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { SkillRegistry } from '../skills/registry.js';

export class SkillsMetaTool {
  private registry: SkillRegistry;

  constructor() {
    this.registry = new SkillRegistry();
  }

  /**
   * Create the single Skill tool following Claude Code pattern
   */
  async createSkillTool(): Promise<FunctionTool> {
    return new FunctionTool({
      name: 'Skill',
      description: `Execute a skill within the main conversation

When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to invoke:
- Use this tool with the skill name and optional arguments
- Examples:
  - skill: "hello-world" - invoke the hello-world skill
  - skill: "file-analyzer", args: "package.json" - invoke with arguments

Important:
- When a skill is relevant, invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention a skill without actually calling this tool
- Only use skills listed in "Available skills" below

Available skills:
${await this.getSkillsList()}`,
      parameters: z.object({
        skill: z.string().describe('The skill name (e.g., "hello-world", "file-analyzer")'),
        args: z.string().optional().describe('Optional arguments for the skill (JSON format for multiple parameters)')
      }),
      execute: async ({ skill, args }) => {
        return await this.executeSkill(skill, args);
      }
    });
  }

  /**
   * Execute a skill by name with arguments
   */
  private async executeSkill(skillName: string, args?: string): Promise<any> {
    // Load the skill
    const skill = await this.registry.loadSkill(skillName);
    if (!skill) {
      return {
        status: 'error',
        error: `Skill '${skillName}' not found`
      };
    }

    // Parse arguments
    let parameters: Record<string, any> = {};
    if (args) {
      try {
        // Try to parse as JSON first
        parameters = JSON.parse(args);
      } catch {
        // If not JSON, treat as simple string for single parameter
        const paramNames = Object.keys(skill.frontmatter.parameters || {});
        if (paramNames.length === 1) {
          parameters[paramNames[0]] = args;
        } else {
          return {
            status: 'error',
            error: 'Invalid arguments format. Use JSON for multiple parameters.'
          };
        }
      }
    }

    // Validate parameters
    const validation = this.registry.validateParameters(skill, parameters);
    if (!validation.valid) {
      return {
        status: 'error',
        error: `Parameter validation failed: ${validation.errors.join(', ')}`
      };
    }

    // Execute the skill
    return await this.registry.executeSkill(skill, {
      parameters,
      skillName,
      basePath: '.'
    });
  }

  /**
   * Get formatted list of available skills for description
   */
  private async getSkillsList(): Promise<string> {
    const skills = await this.registry.loadAllSkills();
    return skills.map(skill =>
      `- ${skill.frontmatter.name}: ${skill.frontmatter.description}`
    ).join('\n');
  }
}