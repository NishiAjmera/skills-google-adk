import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import type { ParsedSkill, SkillExecutionContext, SkillExecutionResult } from './types.js';
import { SkillLoader } from './loader.js';
import { SkillExecutor } from './executor.js';

export class SkillRegistry {
  private loader: SkillLoader;
  private executor: SkillExecutor;
  private loadedSkills: Map<string, ParsedSkill> = new Map();

  constructor() {
    this.loader = new SkillLoader();
    this.executor = new SkillExecutor();
  }

  /**
   * Load all skills and return as ADK FunctionTools
   */
  async loadSkillsAsTools(): Promise<FunctionTool[]> {
    const skills = await this.loader.loadAllSkills();
    const tools: FunctionTool[] = [];

    for (const skill of skills) {
      this.loadedSkills.set(skill.frontmatter.name, skill);
      const tool = this.createSkillTool(skill);
      tools.push(tool);
    }

    return tools;
  }

  /**
   * Create an ADK FunctionTool from a skill
   */
  private createSkillTool(skill: ParsedSkill): FunctionTool {
    // Convert skill parameters to Zod schema
    const parameterSchema = this.createZodSchema(skill.frontmatter.parameters || {});

    return new FunctionTool({
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
      parameters: parameterSchema,
      execute: async (params) => {
        const validation = this.executor.validateParameters(skill, params);
        if (!validation.valid) {
          return {
            status: 'error',
            error: `Parameter validation failed: ${validation.errors.join(', ')}`,
            skillName: skill.frontmatter.name
          };
        }

        const result = await this.executor.executeSkill(skill, {
          parameters: params,
          skillName: skill.frontmatter.name,
          basePath: '.'
        });

        return result;
      }
    });
  }

  /**
   * Convert skill parameter schema to Zod
   */
  private createZodSchema(parameters: Record<string, any>): z.ZodObject<any> {
    const zodFields: Record<string, any> = {};

    for (const [name, config] of Object.entries(parameters)) {
      if (config.required) {
        zodFields[name] = z.string().describe(config.description || '');
      } else {
        zodFields[name] = z.string().optional().describe(config.description || '');
      }
    }

    return z.object(zodFields);
  }

  /**
   * Get loaded skill by name
   */
  getSkill(name: string): ParsedSkill | undefined {
    return this.loadedSkills.get(name);
  }

  /**
   * List all loaded skill names
   */
  getSkillNames(): string[] {
    return Array.from(this.loadedSkills.keys());
  }

  /**
   * Load a single skill by name
   */
  async loadSkill(skillName: string): Promise<ParsedSkill | null> {
    return await this.loader.loadSkill(skillName);
  }

  /**
   * Load all skills
   */
  async loadAllSkills(): Promise<ParsedSkill[]> {
    return await this.loader.loadAllSkills();
  }

  /**
   * Execute a skill with context
   */
  async executeSkill(skill: ParsedSkill, context: SkillExecutionContext): Promise<SkillExecutionResult> {
    return await this.executor.executeSkill(skill, context);
  }

  /**
   * Validate skill parameters
   */
  validateParameters(skill: ParsedSkill, parameters: Record<string, any>): { valid: boolean; errors: string[] } {
    return this.executor.validateParameters(skill, parameters);
  }
}