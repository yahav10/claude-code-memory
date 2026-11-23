## Project Memory
When architectural decisions are made during conversation (technology choices,
pattern selections, trade-off resolutions), use the `save_decision` MCP tool
to record them. Query past decisions with `query_memory`, then `get_decisions`
for the full record of the ones you need. Relevant decisions are loaded into
context automatically at session start and before file edits; honor them.
Full documentation: `.claude/memory-instructions.md`
