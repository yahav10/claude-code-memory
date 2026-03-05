# claude-code-memory

Persistent project memory for Claude Code. Track architectural decisions and query them conversationally across sessions.

## The Problem

Every new Claude Code session starts from scratch. You explain the same architectural decisions repeatedly: "Why did we choose JWT?", "Why Pinia instead of Vuex?", "What was the reasoning behind X?"

CLAUDE.md helps but it's static, non-queryable, and becomes a dumping ground.

## The Solution

An MCP server that gives Claude Code a queryable SQLite database of your project's architectural decisions. Decisions are saved during conversations and persist across sessions.

## Quick Start

```bash
npx claude-code-memory init
```

Restart Claude Code. That's it.

## How It Works

1. **During conversations**, Claude detects architectural decisions and suggests saving them
2. **Decisions are stored** in a local SQLite database at `.claude/project-memory.db`
3. **In future sessions**, Claude automatically loads project memory context
4. **You can query** past decisions: "Why did we choose JWT?"

## MCP Tools

| Tool | Description |
|------|-------------|
| `save_decision` | Save an architectural decision with title, rationale, alternatives |
| `query_memory` | Search decisions using natural language |
| `list_recent` | List recent decisions across sessions |
| `update_decision` | Deprecate or supersede a decision |
| `get_stats` | Get memory statistics (auto-called at session start) |

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx claude-code-memory init` | Initialize project memory |
| `npx claude-code-memory export` | Export decisions (JSON/Markdown/CSV) |
| `npx claude-code-memory import <file>` | Import decisions from JSON |
| `npx claude-code-memory stats` | Show memory statistics |

## Query Examples

- "Why did we choose JWT?"
- "What decisions affect src/auth.ts?"
- "Show me recent decisions"
- "Compare Pinia vs Vuex"
- "Show deprecated decisions"
- "What are the alternatives to Redis?"

## Export Formats

```bash
npx claude-code-memory export                          # JSON (default)
npx claude-code-memory export --format markdown        # Human-readable
npx claude-code-memory export --format csv             # Spreadsheet
npx claude-code-memory export --output ./backup.json   # Custom path
```

## Architecture

- **Storage**: SQLite with FTS5 full-text search, WAL mode
- **Transport**: MCP stdio (spawned by Claude Code)
- **Dependencies**: better-sqlite3, @modelcontextprotocol/sdk, commander
- **Privacy**: 100% local, zero network calls, zero telemetry

## Requirements

- Node.js >= 18
- Claude Code

## License

MIT
