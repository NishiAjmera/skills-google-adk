---
name: file-analyzer
description: Analyzes a file's content, structure, and provides insights
parameters:
  filepath:
    type: string
    description: Path to the file to analyze
    required: true
examples:
  - input: { filepath: "package.json" }
    description: "Analyze the package.json file"
---

# File Analysis for {{filepath}}

Let me analyze the file: {{filepath}}

## File Contents

<read>{{filepath}}</read>

## File Statistics

<bash>wc -l "{{filepath}}"</bash>

<bash>file "{{filepath}}"</bash>

## Analysis Summary

Based on the file contents above, here's my analysis:

- **File Type**: The file command output shows the detected file type
- **Line Count**: Word count shows the file size metrics
- **Content Structure**: The file contents show the internal organization

This demonstrates embedded tool execution within skills!