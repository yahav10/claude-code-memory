# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/yahav10/claude-session-memory/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/yahav10/claude-session-memory/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/yahav10/claude-session-memory/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/yahav10/claude-session-memory/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yahav10/claude-session-memory/releases/tag/v0.1.0
