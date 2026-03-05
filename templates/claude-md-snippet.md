## Project Memory
When architectural decisions are made during conversation (technology choices,
pattern selections, trade-off resolutions), use the `save_decision` MCP tool
to record them. Query past decisions with `query_memory`. At the start of each
session, call `get_stats` to load project memory context.
Full documentation: `.claude/memory-instructions.md`
