---
name: hello-world
description: A simple greeting skill that demonstrates basic skill structure
parameters:
  name:
    type: string
    description: The name to greet
    required: true
examples:
  - input: { name: "Alice" }
    description: "Greet Alice by name"
---

# Hello World Skill

Hello {{name}}! 👋

This is a simple skill that demonstrates:
- YAML frontmatter configuration
- Template variable substitution
- Basic skill structure

Welcome to the skills framework learning experience!