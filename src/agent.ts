import { LlmAgent } from '@google/adk';
import { readFileTool, bashTool } from './tools/index.js';
import { SkillsMetaTool } from './tools/skills.js';

// Initialize skills system
const skillsMetaTool = new SkillsMetaTool();

// Create single Skill tool
const skillTool = await skillsMetaTool.createSkillTool();

export const rootAgent = new LlmAgent({
  name: 'skills_learning_agent',
  model: 'gemini-2.5-flash',
  description: 'Learning agent with complete skills meta-tool architecture.',
  instruction: `You are a helpful assistant demonstrating the skills framework architecture.

Available capabilities:
- read_file: Read any file from the filesystem
- bash: Execute safe shell commands
- Skill: Execute skills from .claude/skills/ directory

The skills system demonstrates meta-tool architecture:
1. Skills are discovered from YAML files
2. They become available through the single Skill tool
3. They support template processing and embedded tool execution

Use the 'Skill' tool to execute available skills by name.

Examples:
- Use Skill tool with skill="hello-world" and appropriate parameters
- Use Skill tool with skill="file-analyzer" and filepath parameter

Always explain what you're demonstrating about the skills architecture.`,
  tools: [
    readFileTool,
    bashTool,
    skillTool  // Single Skill tool instead of individual skills
  ],
});