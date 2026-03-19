/**
 * TypeScript interfaces for the Skills Framework
 * Defines the type system for skill parsing, execution, and results
 */

/**
 * Skill frontmatter structure parsed from YAML
 * Contains metadata and configuration for a skill
 */
export interface SkillFrontmatter {
  /** Unique name identifier for the skill */
  name: string;

  /** Human-readable description of what the skill does */
  description: string;

  /** Optional parameter definitions for the skill */
  parameters?: Record<string, {
    /** Parameter type (string, number, boolean, array, object) */
    type: string;
    /** Description of what this parameter does */
    description: string;
    /** Whether this parameter is required */
    required?: boolean;
    /** Default value if parameter is not provided */
    default?: any;
    /** Allowed values for enum-like parameters */
    enum?: any[];
  }>;

  /** Example usage patterns for the skill */
  examples?: Array<{
    /** Input parameters for this example */
    input: Record<string, any>;
    /** Description of what this example demonstrates */
    description: string;
  }>;

  /** Tags for categorizing and searching skills */
  tags?: string[];

  /** Version of the skill for compatibility tracking */
  version?: string;

  /** Author or maintainer information */
  author?: string;
}

/**
 * Complete parsed skill with frontmatter, content, and metadata
 */
export interface ParsedSkill {
  /** Parsed YAML frontmatter */
  frontmatter: SkillFrontmatter;

  /** Raw markdown/template content after frontmatter */
  content: string;

  /** Absolute file path to the skill file */
  filepath: string;

  /** File modification time for caching */
  lastModified?: Date;

  /** Parsed template sections if applicable */
  sections?: {
    instructions?: string;
    examples?: string;
    notes?: string;
  };
}

/**
 * Context provided during skill execution
 */
export interface SkillExecutionContext {
  /** Parameters passed to the skill */
  parameters: Record<string, any>;

  /** Name of the skill being executed */
  skillName: string;

  /** Base path for resolving relative file paths */
  basePath: string;

  /** Working directory for tool execution */
  workingDirectory?: string;

  /** Environment variables available to the skill */
  environment?: Record<string, string>;

  /** Timeout in milliseconds for skill execution */
  timeout?: number;

  /** Whether to enable verbose logging */
  verbose?: boolean;
}

/**
 * Result of skill execution
 */
export interface SkillExecutionResult {
  /** Execution status */
  status: 'success' | 'error' | 'timeout' | 'cancelled';

  /** Final result content if successful */
  result?: string;

  /** Error message if execution failed */
  error?: string;

  /** Name of the executed skill */
  skillName: string;

  /** Detailed execution steps for debugging */
  executedSteps?: Array<{
    /** Step description or command */
    step: string;
    /** Output from this step */
    output: string;
    /** Step execution status */
    status: 'success' | 'error' | 'skipped';
    /** Timestamp when step was executed */
    timestamp?: Date;
    /** Duration in milliseconds */
    duration?: number;
  }>;

  /** Total execution time in milliseconds */
  executionTime?: number;

  /** Metadata about the execution */
  metadata?: {
    /** Number of tool calls made */
    toolCallCount?: number;
    /** Files read during execution */
    filesRead?: string[];
    /** Commands executed */
    commandsExecuted?: string[];
  };
}

/**
 * Embedded tool call within skill content
 */
export interface EmbeddedToolCall {
  /** Type of tool being called */
  tool: 'bash' | 'read';

  /** Content/parameters for the tool call */
  content: string;

  /** Optional timeout for this specific tool call */
  timeout?: number;

  /** Whether this tool call is required for skill success */
  required?: boolean;

  /** Description of what this tool call does */
  description?: string;
}

/**
 * Template processing context for skill content
 */
export interface TemplateContext {
  /** Parameters passed to the skill */
  parameters: Record<string, any>;

  /** Helper functions available in templates */
  helpers?: Record<string, (...args: any[]) => any>;

  /** Global variables available to all skills */
  globals?: Record<string, any>;
}

/**
 * Skill registry entry for managing loaded skills
 */
export interface SkillRegistryEntry {
  /** The parsed skill */
  skill: ParsedSkill;

  /** When this skill was loaded */
  loadedAt: Date;

  /** Number of times this skill has been executed */
  executionCount: number;

  /** Last execution time */
  lastExecuted?: Date;

  /** Whether this skill is currently enabled */
  enabled: boolean;

  /** Validation errors if any */
  validationErrors?: string[];
}

/**
 * Configuration for the skills system
 */
export interface SkillsConfig {
  /** Directories to scan for skills */
  skillDirectories: string[];

  /** File patterns to include when scanning */
  includePatterns: string[];

  /** File patterns to exclude when scanning */
  excludePatterns: string[];

  /** Default timeout for skill execution */
  defaultTimeout: number;

  /** Maximum number of concurrent skill executions */
  maxConcurrentExecutions: number;

  /** Whether to enable skill caching */
  enableCaching: boolean;

  /** Cache TTL in milliseconds */
  cacheTtl: number;

  /** Security settings */
  security: {
    /** Whether to allow bash tool execution */
    allowBashExecution: boolean;
    /** Allowed file read paths */
    allowedReadPaths: string[];
    /** Blocked commands for bash tool */
    blockedCommands: string[];
  };
}

/**
 * Error types for skill operations
 */
export class SkillError extends Error {
  constructor(
    message: string,
    public skillName: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SkillError';
  }
}

export class SkillParseError extends SkillError {
  constructor(message: string, skillName: string, details?: any) {
    super(message, skillName, 'PARSE_ERROR', details);
    this.name = 'SkillParseError';
  }
}

export class SkillExecutionError extends SkillError {
  constructor(message: string, skillName: string, details?: any) {
    super(message, skillName, 'EXECUTION_ERROR', details);
    this.name = 'SkillExecutionError';
  }
}

export class SkillValidationError extends SkillError {
  constructor(message: string, skillName: string, details?: any) {
    super(message, skillName, 'VALIDATION_ERROR', details);
    this.name = 'SkillValidationError';
  }
}

/**
 * Type guards for runtime type checking
 */
export function isSkillFrontmatter(obj: any): obj is SkillFrontmatter {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string'
  );
}

export function isParsedSkill(obj: any): obj is ParsedSkill {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isSkillFrontmatter(obj.frontmatter) &&
    typeof obj.content === 'string' &&
    typeof obj.filepath === 'string'
  );
}

export function isEmbeddedToolCall(obj: any): obj is EmbeddedToolCall {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj.tool === 'bash' || obj.tool === 'read') &&
    typeof obj.content === 'string'
  );
}