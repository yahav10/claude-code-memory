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

---

<div align="center">

## 💰 The Real Cost of Forgetting

</div>

Every time Claude doesn't know your project context, **you pay for it** — in tokens, in time, and in wrong answers.

```
  Without memory                          With memory
  ─────────────────                       ─────────────────
  You: "Add auth to /orders"              You: "Add auth to /orders"
        │                                       │
        ▼                                       ▼
  Claude: "What auth system                Claude calls query_memory("auth")
   do you use? JWT? Sessions?                    │
   OAuth? What middleware?"                      ▼
        │                                 Claude: "Adding JWT middleware
        ▼                                  using your existing auth pattern
  You: [5 minutes re-explaining]           from decision #12..."
        │                                       │
        ▼                                       ▼
  Claude: "Got it. And what                ✅ Correct implementation
   database? What ORM?"                      on first try
        │
        ▼
  You: [3 more minutes explaining]
        │
        ▼
  Claude builds it wrong anyway
   because context was incomplete
```

<table>
<tr>
<td width="50%">

**Without memory (session 30)**
- 🔄 Re-explain 3-5 decisions per session
- 💬 10-15 extra back-and-forth messages
- ❌ Wrong assumptions from missing context
- 🔥 Token burn on repeated explanations
- ⏱️ ~15 min wasted per session

</td>
<td width="50%">

**With memory (session 30)**
- ✅ Claude recalls all 47 decisions instantly
- 💬 Skip straight to implementation
- 🎯 Correct assumptions from day one
- 📉 Fewer tokens, faster completions
- ⏱️ Time saved compounds every session

</td>
</tr>
</table>

> **The math**: If you run 3 Claude Code sessions/day and waste ~15 min each re-explaining context, that's **5+ hours/week**. With a team of 4, that's **20 hours/week** — gone. Project memory eliminates this entirely.

---

## 💡 The Solution

An MCP server that gives Claude Code a **queryable SQLite database** of your project's architectural decisions. Decisions are saved during conversations and persist across sessions.

## ✨ Why Use It

| Benefit | What it means for you |
|---------|----------------------|
| 💰 **Save tokens and money** | Claude gets context from memory instead of you burning tokens re-explaining it |
| 🔁 **Never re-explain decisions** | Claude remembers what you decided and why, across every session |
| 🎯 **Right answers on first try** | Full project context means fewer wrong assumptions and less back-and-forth |
| 📈 **Knowledge that compounds** | Session 1 is normal. Session 50 feels like magic — Claude knows everything |
| 🚀 **Instant team onboarding** | New team members query past decisions instead of digging through Slack threads |
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
| `save_decision` | 💾 Save an architectural decision with title, rationale, alternatives. Auto-detects duplicates via Jaccard similarity |
| `query_memory` | 🔍 Search decisions using natural language |
| `list_recent` | 📋 List recent decisions across sessions |
| `update_decision` | ♻️ Deprecate or supersede a decision |
| `get_stats` | 📊 Get memory statistics (auto-called at session start) |
| `sync_claude_md` | 📝 Export active decisions into your CLAUDE.md with auto-managed markers |

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
| `npx claude-code-memory workspace-setup [dir]` | 🔗 Share context memory across all sub-projects in a workspace |
| `npx claude-code-memory export` | 📤 Export decisions (JSON/Markdown/CSV) |
| `npx claude-code-memory import <file>` | 📥 Import decisions from JSON |
| `npx claude-code-memory sync-claudemd` | 📝 Sync active decisions into CLAUDE.md |
| `npx claude-code-memory stats` | 📊 Show memory statistics |

### Workspace Setup

If you have a monorepo or workspace with multiple sub-projects (each with their own `.git`), use `workspace-setup` to share context memory across all of them:

```bash
npx claude-code-memory workspace-setup /path/to/workspace
npx claude-code-memory workspace-setup --dry-run   # Preview changes
npx claude-code-memory workspace-setup --force      # Overwrite existing configs
```

This symlinks the root `.mcp.json` into every git sub-project so they all share the same decision history.

### Export Formats

```bash
npx claude-code-memory export                          # JSON (default)
npx claude-code-memory export --format markdown        # Human-readable
npx claude-code-memory export --format csv             # Spreadsheet
npx claude-code-memory export --output ./backup.json   # Custom path
```

## 🧹 Smart Deduplication

When saving a new decision, the server automatically compares it against existing ones using **Jaccard similarity** on tokenized text:

| Similarity | Action |
|------------|--------|
| **> 0.8** | Auto-supersedes the older decision — you don't need to clean up |
| **0.6 – 0.8** | Returns a warning with similar decisions so you can decide |
| **< 0.6** | Saved without warnings |

No configuration needed — dedup runs on every `save_decision` call.

## ⏳ Confidence Decay

Decisions tagged `temporary` or `experimental` automatically **fade over 30 days**:

```
Day  0  → confidence 1.0 (full strength)
Day 15  → confidence 0.5 (half strength)
Day 30  → confidence 0.0 (fully faded)
```

Faded decisions (confidence < 0.3) are excluded from CLAUDE.md sync but remain queryable. Regular decisions **never decay** regardless of age.

## 📝 CLAUDE.md Sync

Auto-generate a structured decisions section in your `CLAUDE.md`:

```bash
npx claude-code-memory sync-claudemd
```

Or call `sync_claude_md` as an MCP tool during a conversation. The output is injected between markers:

```markdown
<!-- DECISIONS:START -->
## Architectural Decisions
_Auto-generated from project memory — 5 active decisions_

### Auth
- **Use JWT for authentication** — Stateless and scalable [auth, security]

### Database
- **Use PostgreSQL with Prisma** — ACID compliance [database]
<!-- DECISIONS:END -->
```

Any content **outside** the markers is preserved. If no markers exist, they're appended. If no `CLAUDE.md` exists, one is created.

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

### What using project memory actually feels like

**Session 1** — You save your first decision. Nothing special yet.<br>
**Session 5** — Claude stops asking what database you use. It knows.<br>
**Session 20** — You say "add caching" and Claude already knows your stack, your patterns, your preferences.<br>
**Session 50** — A new teammate opens Claude Code and asks "how does auth work?" — full history, instantly.<br>

**The more you use it, the more valuable it becomes.**

---

**Built with ❤️ for the Claude Code community**

*Stop re-explaining. Start remembering.*

</div>
