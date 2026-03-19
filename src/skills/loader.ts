/**
 * Skills Loader - YAML parsing and progressive disclosure
 * Implements the foundation for loading and parsing skills from the filesystem
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { load as loadYaml } from 'js-yaml';
import type { SkillFrontmatter, ParsedSkill } from './types.js';
import { SkillParseError, SkillValidationError } from './types.js';

/**
 * Skills Loader class for discovery and parsing of skills
 * Implements progressive disclosure pattern - loads minimal metadata initially,
 * full content only when needed
 */
export class SkillLoader {
  private skillsDirectory: string;

  constructor(skillsDirectory: string = 'skills') {
    this.skillsDirectory = skillsDirectory;
  }

  /**
   * Discover all skill directories
   * Returns array of skill directory names (not full paths)
   */
  async discoverSkills(): Promise<string[]> {
    try {
      const entries = await readdir(this.skillsDirectory, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      console.warn(`Could not read skills directory: ${this.skillsDirectory}`);
      return [];
    }
  }

  /**
   * Load and parse a single skill
   * Returns null if skill cannot be loaded (with warning logged)
   */
  async loadSkill(skillName: string): Promise<ParsedSkill | null> {
    try {
      const skillPath = join(this.skillsDirectory, skillName, 'SKILL.md');
      const content = await readFile(skillPath, 'utf-8');

      // Get file modification time for caching
      const stats = await stat(skillPath);
      const lastModified = stats.mtime;

      const parsedSkill = this.parseSkillContent(content, skillPath);

      // Add lastModified timestamp
      parsedSkill.lastModified = lastModified;

      return parsedSkill;
    } catch (error) {
      console.warn(`Failed to load skill ${skillName}:`, error);
      return null;
    }
  }

  /**
   * Parse skill content with YAML frontmatter
   * Throws SkillParseError for malformed content
   */
  parseSkillContent(content: string, filepath: string): ParsedSkill {
    // Split frontmatter and content
    const frontmatterRegex = /^---\n(.*?)\n---\n(.*)/s;
    const match = content.match(frontmatterRegex);

    if (!match) {
      throw new SkillParseError(
        'Invalid skill format: missing YAML frontmatter',
        'unknown',
        { filepath }
      );
    }

    const [, frontmatterYaml, skillContent] = match;

    let frontmatter: SkillFrontmatter;
    try {
      frontmatter = loadYaml(frontmatterYaml) as SkillFrontmatter;
    } catch (error) {
      throw new SkillParseError(
        `Failed to parse YAML frontmatter: ${error}`,
        'unknown',
        { filepath, yamlError: error }
      );
    }

    // Validate required fields
    this.validateFrontmatter(frontmatter, filepath);

    // Parse content sections (for progressive disclosure)
    const sections = this.parseContentSections(skillContent);

    return {
      frontmatter,
      content: skillContent.trim(),
      filepath,
      sections
    };
  }

  /**
   * Validate frontmatter has required fields
   * Throws SkillValidationError for invalid frontmatter
   */
  private validateFrontmatter(frontmatter: any, filepath: string): void {
    const skillName = frontmatter?.name || 'unknown';

    if (!frontmatter || typeof frontmatter !== 'object') {
      throw new SkillValidationError(
        'Frontmatter must be an object',
        skillName,
        { filepath }
      );
    }

    if (!frontmatter.name || typeof frontmatter.name !== 'string') {
      throw new SkillValidationError(
        'Skill must have a name field of type string',
        skillName,
        { filepath }
      );
    }

    if (!frontmatter.description || typeof frontmatter.description !== 'string') {
      throw new SkillValidationError(
        'Skill must have a description field of type string',
        skillName,
        { filepath }
      );
    }

    // Validate parameters structure if present
    if (frontmatter.parameters) {
      this.validateParameters(frontmatter.parameters, skillName, filepath);
    }

    // Validate examples structure if present
    if (frontmatter.examples) {
      this.validateExamples(frontmatter.examples, skillName, filepath);
    }
  }

  /**
   * Validate parameters structure
   */
  private validateParameters(parameters: any, skillName: string, filepath: string): void {
    if (typeof parameters !== 'object' || parameters === null) {
      throw new SkillValidationError(
        'Parameters must be an object',
        skillName,
        { filepath }
      );
    }

    for (const [paramName, paramDef] of Object.entries(parameters)) {
      if (typeof paramDef !== 'object' || paramDef === null) {
        throw new SkillValidationError(
          `Parameter ${paramName} must be an object`,
          skillName,
          { filepath, parameter: paramName }
        );
      }

      const def = paramDef as any;
      if (!def.type || typeof def.type !== 'string') {
        throw new SkillValidationError(
          `Parameter ${paramName} must have a type field`,
          skillName,
          { filepath, parameter: paramName }
        );
      }

      if (!def.description || typeof def.description !== 'string') {
        throw new SkillValidationError(
          `Parameter ${paramName} must have a description field`,
          skillName,
          { filepath, parameter: paramName }
        );
      }
    }
  }

  /**
   * Validate examples structure
   */
  private validateExamples(examples: any, skillName: string, filepath: string): void {
    if (!Array.isArray(examples)) {
      throw new SkillValidationError(
        'Examples must be an array',
        skillName,
        { filepath }
      );
    }

    for (let i = 0; i < examples.length; i++) {
      const example = examples[i];
      if (typeof example !== 'object' || example === null) {
        throw new SkillValidationError(
          `Example ${i} must be an object`,
          skillName,
          { filepath, exampleIndex: i }
        );
      }

      if (!example.input || typeof example.input !== 'object') {
        throw new SkillValidationError(
          `Example ${i} must have an input object`,
          skillName,
          { filepath, exampleIndex: i }
        );
      }

      if (!example.description || typeof example.description !== 'string') {
        throw new SkillValidationError(
          `Example ${i} must have a description string`,
          skillName,
          { filepath, exampleIndex: i }
        );
      }
    }
  }

  /**
   * Parse content sections for progressive disclosure
   * Identifies common sections like instructions, examples, notes
   */
  private parseContentSections(content: string): { instructions?: string; examples?: string; notes?: string } {
    const sections: { instructions?: string; examples?: string; notes?: string } = {};

    // Split content by markdown headers
    const headerRegex = /^(#{1,6})\s+(.+)$/gm;
    const parts = content.split(headerRegex);

    let currentSection = 'instructions'; // Default section
    let currentContent = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // Check if this is a header level
      if (part && part.match(/^#{1,6}$/)) {
        // Save previous section
        if (currentContent.trim()) {
          sections[currentSection as keyof typeof sections] = currentContent.trim();
        }

        // Get header text (next part)
        const headerText = parts[i + 1]?.toLowerCase() || '';

        // Determine section type based on header
        if (headerText.includes('example')) {
          currentSection = 'examples';
        } else if (headerText.includes('note') || headerText.includes('tip')) {
          currentSection = 'notes';
        } else {
          currentSection = 'instructions';
        }

        currentContent = '';
        i++; // Skip the header text part
      } else if (part) {
        currentContent += part;
      }
    }

    // Save final section
    if (currentContent.trim()) {
      sections[currentSection as keyof typeof sections] = currentContent.trim();
    }

    return sections;
  }

  /**
   * Load all available skills
   * Returns array of successfully loaded skills (failed skills are logged and skipped)
   */
  async loadAllSkills(): Promise<ParsedSkill[]> {
    const skillNames = await this.discoverSkills();
    const skills: ParsedSkill[] = [];

    for (const skillName of skillNames) {
      const skill = await this.loadSkill(skillName);
      if (skill) {
        skills.push(skill);
      }
    }

    return skills;
  }

  /**
   * Load skill metadata only (frontmatter without content parsing)
   * Useful for progressive disclosure - get list of available skills quickly
   */
  async loadSkillMetadata(skillName: string): Promise<SkillFrontmatter | null> {
    try {
      const skillPath = join(this.skillsDirectory, skillName, 'SKILL.md');
      const content = await readFile(skillPath, 'utf-8');

      // Extract just the frontmatter
      const frontmatterRegex = /^---\n(.*?)\n---/s;
      const match = content.match(frontmatterRegex);

      if (!match) {
        throw new SkillParseError(
          'Invalid skill format: missing YAML frontmatter',
          skillName,
          { filepath: skillPath }
        );
      }

      const frontmatter = loadYaml(match[1]) as SkillFrontmatter;
      this.validateFrontmatter(frontmatter, skillPath);

      return frontmatter;
    } catch (error) {
      console.warn(`Failed to load metadata for skill ${skillName}:`, error);
      return null;
    }
  }

  /**
   * Load metadata for all available skills
   * Progressive disclosure - get overview without full content
   */
  async loadAllSkillMetadata(): Promise<SkillFrontmatter[]> {
    const skillNames = await this.discoverSkills();
    const metadata: SkillFrontmatter[] = [];

    for (const skillName of skillNames) {
      const meta = await this.loadSkillMetadata(skillName);
      if (meta) {
        metadata.push(meta);
      }
    }

    return metadata;
  }
}