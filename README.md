<div align="center">

# 🧠 claude-code-memory

**Give Claude Code a memory. Never re-explain architectural decisions again.**

[![npm version](https://img.shields.io/npm/v/claude-code-memory?color=blue&label=npm)](https://www.npmjs.com/package/claude-code-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![100% Local](https://img.shields.io/badge/Privacy-100%25_Local-purple)](/)
[![Zero Telemetry](https://img.shields.io/badge/Telemetry-Zero-orange)](/)

*Save architectural decisions during conversations. Query them forever. 100% local.*

</div>

---

## 😤 The Problem

Every new Claude Code session starts from scratch.

> **Session 1**: "Let's use JWT for authentication because our microservices need stateless auth..."
>
> **Session 14**: "Why are we using JWT?" — Claude has no idea.
>
> **Session 27**: You're explaining the same decision *for the fifth time*.

`CLAUDE.md` helps but it's static, non-queryable, and becomes a dumping ground.

## 💡 The Solution

An MCP server that gives Claude Code a **queryable SQLite database** of your project's architectural decisions. Decisions are saved during conversations and persist across sessions.

## ✨ Why Use It

| Benefit | What it means for you |
|---------|----------------------|
| 🔁 **Never re-explain decisions** | Claude remembers what you decided and why, across every session |
| 🔍 **Queryable architectural history** | Ask "why did we choose React?" and get the full rationale, alternatives, and trade-offs |
| 📈 **Knowledge that compounds** | Every session builds on all previous ones — the more you use it, the more valuable it becomes |
| 🚀 **Instant onboarding** | New team members query past decisions instead of digging through Slack threads |
| 🏛️ **Decision archaeology** | Six months later, the "why" behind your codebase is one question away |
| 🔒 **100% local and private** | SQLite on your machine, zero network calls, zero telemetry |

## ⚡ Quick Start

```bash
npx claude-code-memory init
```

Restart Claude Code. **That's it.** 🎉

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Claude Code Conversation                               │
│                                                         │
│  You: "Let's use PostgreSQL with Prisma ORM"            │
│                                                         │
│  Claude: "That sounds like an architectural decision.   │
│  Want me to save it?"                                   │
│                                                         │
│  You: "Yes"                                             │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────┐    ┌──────────────────────────┐    │
│  │  save_decision   │───▶│  .claude/project-memory.db│   │
│  └─────────────────┘    └──────────────────────────┘    │
└─────────────────────────────────────────────────────────┘

             ···  Next session  ···

┌─────────────────────────────────────────────────────────┐
│  You: "Why did we choose PostgreSQL?"                   │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────┐    ┌──────────────────────────┐    │
│  │  query_memory    │◀──│  .claude/project-memory.db│   │
│  └─────────────────┘    └──────────────────────────┘    │
│           │                                             │
│           ▼                                             │
│  Claude: "You chose PostgreSQL 16 with Prisma ORM      │
│  because of ACID compliance, JSON support, and strong   │
│  community. Alternatives considered: MySQL, MongoDB."   │
└─────────────────────────────────────────────────────────┘
```

## 🛠️ MCP Tools

| Tool | Description |
|------|-------------|
| `save_decision` | 💾 Save an architectural decision with title, rationale, alternatives |
| `query_memory` | 🔍 Search decisions using natural language |
| `list_recent` | 📋 List recent decisions across sessions |
| `update_decision` | ♻️ Deprecate or supersede a decision |
| `get_stats` | 📊 Get memory statistics (auto-called at session start) |

## 💬 Query Examples

```
"Why did we choose JWT?"
"What decisions affect src/auth.ts?"
"Show me recent decisions"
"Compare Pinia vs Vuex"
"Show deprecated decisions"
"What are the alternatives to Redis?"
```

## 🖥️ CLI Commands

| Command | Description |
|---------|-------------|
| `npx claude-code-memory init` | 🏁 Initialize project memory |
| `npx claude-code-memory export` | 📤 Export decisions (JSON/Markdown/CSV) |
| `npx claude-code-memory import <file>` | 📥 Import decisions from JSON |
| `npx claude-code-memory stats` | 📊 Show memory statistics |

### Export Formats

```bash
npx claude-code-memory export                          # JSON (default)
npx claude-code-memory export --format markdown        # Human-readable
npx claude-code-memory export --format csv             # Spreadsheet
npx claude-code-memory export --output ./backup.json   # Custom path
```

## 🏗️ Architecture

```
claude-code-memory
├── Storage:      SQLite + FTS5 full-text search, WAL mode
├── Transport:    MCP stdio (spawned by Claude Code)
├── Dependencies: better-sqlite3, @modelcontextprotocol/sdk, commander
└── Privacy:      100% local — zero network calls, zero telemetry
```

## 📋 Requirements

- **Node.js** >= 18
- **Claude Code**

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 📄 License

MIT — use it however you like.

---

<div align="center">

**Built with ❤️ for the Claude Code community**

*Stop re-explaining. Start remembering.*

</div>
