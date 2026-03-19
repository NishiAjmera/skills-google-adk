import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { readFile, stat } from 'fs/promises';
import { resolve, normalize } from 'path';

// Security constants
const MAX_FILE_SIZE = 1024 * 1024; // 1MB limit
const WORKING_DIR = process.cwd();

export const readFileTool = new FunctionTool({
  name: 'read_file',
  description: 'Read the contents of a file from the filesystem.',
  parameters: z.object({
    filepath: z.string().describe('Path to the file to read (relative or absolute)'),
  }),
  execute: async ({ filepath }) => {
    try {
      // Enhanced path security: normalize, resolve, and validate boundaries
      const safePath = resolve(normalize(filepath));

      // Prevent directory traversal attacks
      if (!safePath.startsWith(WORKING_DIR)) {
        return {
          status: 'error',
          error: 'Access denied: Path outside working directory',
          path: filepath
        };
      }

      // Check file stats before reading
      const stats = await stat(safePath);

      // Prevent memory exhaustion from large files
      if (stats.size > MAX_FILE_SIZE) {
        return {
          status: 'error',
          error: `File too large: ${stats.size} bytes (max: ${MAX_FILE_SIZE})`,
          path: safePath
        };
      }

      // Additional check for binary files (basic heuristic)
      if (stats.size > 0) {
        // Read a small sample to check for binary content
        const sample = await readFile(safePath, { encoding: null }).then(buf => buf.slice(0, 100));
        if (sample.includes(0)) {
          return {
            status: 'error',
            error: 'File appears to be binary - text files only',
            path: safePath
          };
        }
      }

      // Read file content
      const content = await readFile(safePath, 'utf-8');

      return {
        status: 'success',
        content: content,
        path: safePath,
        size: content.length
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error reading file',
        path: filepath
      };
    }
  },
});