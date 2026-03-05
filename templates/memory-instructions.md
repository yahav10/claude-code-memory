# Project Memory System

This project uses `claude-code-memory` for architectural decision tracking.

## When to Save Decisions

Proactively save decisions when:
- **Technology/library choices** (e.g., "Use Pinia instead of Vuex")
- **Architectural patterns** (e.g., "Split auth into microservice")
- **Trade-off resolutions** (e.g., "Optimize for readability over performance")
- **Coding conventions** (e.g., "Use composition API for all new components")
- **Deprecations** (e.g., "Stop using mixins, use composables")

## How to Save

Use the `save_decision` MCP tool with these fields:
- `title` (required): Brief summary (e.g., "Use JWT for authentication")
- `decision` (required): What was chosen
- `rationale` (required): **WHY** it was chosen (most important!)
- `alternatives` (optional): What else was considered
- `consequences` (optional): Trade-offs and implications
- `files` (optional): Array of affected file paths
- `tags` (optional): Categories like ["auth", "database", "performance"]

## Query Examples

- "Why did we choose JWT?"
- "What decisions involve authentication?"
- "Show me recent decisions"
- "What files are affected by the auth decision?"
- "Compare Pinia vs Vuex"

## Proactive Saving

When you detect an architectural decision during conversation, proactively
suggest saving it by presenting the pre-filled data and asking for confirmation
before calling `save_decision`.
