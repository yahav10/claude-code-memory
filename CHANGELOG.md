# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-11-23

### Changed
- **Context hooks start much faster.** The hooks run on every file edit, and `npx -y` checked the registry each time (0.7 to 1.6s per edit). They now use a global `claude-session-memory` when one is on `PATH` (about 0.06s) and otherwise `npx --prefer-offline` (about 0.35s). No absolute paths are written, so committed project settings still work for teammates. Re-run `init` to upgrade existing hooks; `npm install -g claude-session-memory` gives the fastest start.

### Fixed
- `init` refuses to rewrite a `settings.json` it cannot parse (it used to overwrite it and drop the user's other settings).

## [0.5.0] - 2026-11-18

### Added
- **Decisions are pushed into context, not just stored.** `init` installs hooks so Claude sees the right decisions without having to remember to ask. Measured on a real project, the agent previously called `query_memory` twice in five months.
  - `SessionStart` (startup, resume, clear, compact): decisions for the current branch and uncommitted files, capped at about 750 tokens.
  - `PreToolUse` on `Edit`/`Write`/`MultiEdit`/`NotebookEdit`: decisions recorded for that exact file, capped at about 375 tokens.
  - `UserPromptSubmit` (opt-in with `init --prompt-recall`, needs the local embedding model): decisions related to the request.
  - Each hook shows a decision once per session, and again after compaction or `/clear`. `init --no-push-hooks` skips all of this.
- **Progressive disclosure.** `query_memory` now returns one compact line per match; the new `get_decisions` tool returns full records for the ids you pick. Pass `detail: "full"` for the old complete output.
- **Compaction capture.** `PreCompact` asks the summary to keep decisions, and `PostCompact` extracts them from the compaction summary in the background. The final SessionEnd capture still completes the session and skips duplicates.
- `get_stats` reports how many decisions were injected and the tokens spent.
- New `claude-session-memory hook <event>` command (used by the hooks; not meant to be run by hand).

### Fixed
- **MCP server and tests crashed intermittently on Node 24** (`Assertion failed: (env) != nullptr` inside `better-sqlite3`'s garbage collection). Upgraded `better-sqlite3` from 11 to 12.11.1: 0 crashes in 15 runs, where the old version crashed in 4 of 12 on this branch. The test suite, which had four files aborting on exit, now passes cleanly.
- Capture no longer stores a decision that restates an existing active one (compaction and SessionEnd capture can both see the same decision).
- Decisions with no alternatives no longer print an empty "Alternatives" line.

### Changed
- **Requires Node 20 or newer** (was 18), because of the `better-sqlite3` upgrade.
- Memory instructions and the CLAUDE.md snippet no longer tell the agent to call `get_stats` at session start.

## [0.4.1] - 2026-11-16

### Fixed
- **Automatic capture never completed** — Claude Code gives all `SessionEnd` hooks a shared 1.5s budget and cancels slower ones ("Hook cancelled"); `capture` ran the Haiku extraction inline and was killed. The hook now hands the session to a detached background worker and returns immediately, and is installed with `timeout: 30` so the `npx` launch itself isn't cut off. Re-running `init` upgrades hooks written by older versions in place.
- **`init --scope global` registered nothing** — it wrote `mcpServers` into `~/.claude/settings.json`, which Claude Code does not read. It now registers a user-scope server via `claude mcp add-json --scope user` (printing the exact command if `claude` isn't on PATH) and removes the dead `settings.json` entry.
- **Thousands of empty sessions** — the MCP server created a session row on every launch, even when memory was never used. The row is now created on first tool use.
- **Extraction fed injected content to the model** — `isMeta` transcript records (skill bodies, subagent reports, command caveats) were treated as user messages, could fill the ~8K-char extraction budget, and could become the session's "first prompt". They are now skipped.

### Changed
- Extraction and analytics-coach model is configurable via `CLAUDE_SESSION_MEMORY_MODEL`; default moved from the pinned `claude-haiku-4-5-20251001` to `claude-haiku-5-5`.
- CLI `--version` and MCP server version now report the package version instead of `0.1.0`.

## [0.4.0] - 2026-06-22

### Added
- **Automatic Session Capture** — `init` now installs a `SessionEnd` hook that captures each finished session into memory automatically (via the new `capture` command). Decisions are extracted with Haiku and saved without relying on the agent to call `save_decision`. Idempotent — sessions already stored are skipped. Falls back to metadata-only when no API key is configured.
- **Semantic Search** — `query_memory` now blends keyword/FTS results with vector similarity, so paraphrased questions match (e.g. "how do users prove their identity?" finds "stateless token authentication"). Runs locally via a small sentence-embedding model (`multi-qa-MiniLM-L6-cos-v1`, 384-dim); the optional `@xenova/transformers` dependency loads lazily and degrades gracefully to keyword search if absent.
- **`reindex` CLI command** — Backfills embeddings for existing decisions.

### Changed
- `decisions` table gains an `embedding` column (auto-migrated; excluded from exports and API responses)
- `query_memory` is now async and returns semantic matches with a `semantic_score` when keyword results don't fill the limit

## [0.3.0] - 2026-03-09

### Added
- **Session Intelligence** — `get_stats` now auto-loads last session context (branch, decisions, files) and surfaces relevant decisions for current work based on file matching, branch keywords, and recency
- **Token Savings Tracking** — Every `query_memory` call is logged with estimated tokens saved. ROI metrics available via `get_stats` and dashboard
- **Session Review Tool** — New `review_session` MCP tool shows files changed without decisions and suggests what to save before ending a session
- **Memory ROI Dashboard** — 4-card grid on Analytics page: Total Queries, Hit Rate, Tokens Saved, Time Saved
- **Git Context Capture** — Sessions automatically record git branch and project path at start and end

### Changed
- `get_stats` output now includes last session summary, relevant decisions, and token savings ROI
- `query_memory` now logs queries for ROI tracking
- Memory instructions template includes session start/end workflow
- README updated with session intelligence, ROI tracking, and new tool descriptions

## [0.2.0] - 2026-03-07

### Added
- **Smart Deduplication** — Jaccard similarity detection on `save_decision`. Auto-supersedes >0.8 similarity, warns on 0.6–0.8
- **Confidence Decay** — Decisions tagged `temporary` or `experimental` fade linearly over 30 days
- **CLAUDE.md Sync** — New `sync_claude_md` MCP tool and `sync-claudemd` CLI command. Auto-generates decisions section with marker-based injection
- **Workspace Setup** — New `workspace-setup` CLI command to share context memory across monorepo sub-projects via symlinks
- **API Key Persistence** — Save Anthropic API key in settings (stored in local DB, never transmitted)
- **Coach Summary Persistence** — AI coach insights cached with 24h TTL

### Changed
- `save_decision` now returns dedup warnings and auto-supersede info
- `get_stats` now reports fading (low-confidence) decision count
- README redesigned with ROI section, cost comparison, and session progression

## [0.1.3] - 2026-03-06

### Added
- **Developer Analytics** — Work pattern metrics, decision quality scores, codebase knowledge tracking
- **AI Coach** — Anthropic-powered insights on your decision patterns with 24h cache
- **Analytics Page** — Full dashboard page with charts, metrics cards, and coach summary

### Fixed
- Extraction max_tokens increased to handle larger transcripts
- Filter checkboxes styled to match dark theme
- Session summaries cleaned of XML tags and system prompts

## [0.1.2] - 2026-03-06

### Added
- **Session Import** — Import decisions from Claude Code session transcripts (`~/.claude/projects/`)
- **JSONL Parser** — Parse Claude Code session files with streaming support
- **Session Scanner** — Auto-discover sessions across all projects
- **AI Decision Extractor** — Uses Claude Haiku to identify architectural decisions in transcripts
- **Import CLI** — `import-sessions` command with scan, preview, and batch import
- **Import UI** — Web dashboard page with scan, preview, and progress tracking

## [0.1.1] - 2026-03-06

### Added
- **Web Dashboard** — Vue 3 + Vite + Tailwind CSS frontend
- **REST API** — Fastify server with routes for dashboard, decisions, sessions, settings, export
- **Dashboard Page** — Stats overview, decision timeline chart, recent decisions, tag cloud
- **Decisions Browser** — Full-text search, status/tag filters, pagination
- **Decision Detail** — Complete decision view with metadata and history
- **Sessions Page** — Session timeline with detail view
- **Import/Export Page** — Format selection, drag-and-drop upload
- **Settings Page** — Database info and maintenance tools
- **Production Build** — Vue build pipeline integrated with CLI `web` command

## [0.1.0] - 2026-03-05

### Added
- **MCP Server** — 5 tools (save_decision, query_memory, list_recent, update_decision, get_stats) over stdio transport
- **SQLite Storage** — WAL mode, FTS5 full-text search, session tracking
- **Query Router** — 9 intent patterns with hybrid FTS5 fallback
- **CLI** — `init`, `export`, `import`, `stats` commands
- **Export Formats** — JSON, Markdown, CSV
- **Templates** — CLAUDE.md and memory-instructions auto-generated on init
- Initial README with quick start guide

[0.3.0]: https://github.com/yahav10/claude-session-memory/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/yahav10/claude-session-memory/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/yahav10/claude-session-memory/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/yahav10/claude-session-memory/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/yahav10/claude-session-memory/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yahav10/claude-session-memory/releases/tag/v0.1.0
