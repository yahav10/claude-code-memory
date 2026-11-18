# claude-session-memory — capability research (2026-11-16)

Scope: what changed in Claude Code / MCP since our last release, what competing memory tools ship, and what we should add. Sources: official code.claude.com docs + changelog (latest 2.1.325, 2026-11-13), MCP spec changelogs, competitor READMEs/docs, plus our own production DB.

## 0. What our own usage data says

From the most-used install (`nexxen-workspace/.claude/project-memory.db`, Mar → Nov 2026):

| Signal | Value | Meaning |
|---|---|---|
| Decisions | 303 (284 `haiku-import`, 19 manual) | Agents almost never call `save_decision` on their own. Bulk import is what filled memory. |
| `query_memory` calls logged | **2** in 5 months | Pull-based recall basically never happens. The memory exists but is not being read. |
| Sessions with source `mcp` | 2,236, of which 1,799 have no summary | One session row per MCP server start → noise in stats and dashboard. |
| Sessions with source `hook` | 0 (all DBs) | v0.4.0 auto-capture has never run for real (unpublished; hook not installed). |
| Decisions with file anchors | 286 / 303 | We already have the data needed for file-scoped injection and staleness checks. |

**Core conclusion:** the bottleneck is not storage or search quality — nothing pushes the memory into Claude's context. Every high-priority item below follows from that.

## 1. Bugs / release blockers (fix first)

1. **v0.4.0 is not on npm.** npm `latest` is 0.3.1 (2026-03-09). Auto-capture and semantic search are unreleased.
2. **SessionEnd capture will almost certainly be killed.** All SessionEnd hooks share a **1.5s default budget** (max 60s via per-hook `timeout`; plugin hooks can't raise it). Our hook runs `npx claude-session-memory capture` synchronously: npx resolution + a Haiku call. Fix: hook spawns a detached child and exits 0 immediately; call `node <abs path>/dist/cli.js` instead of `npx`. *(Inferred from docs, not yet reproduced.)*
3. **`init --global` writes `mcpServers` into `~/.claude/settings.json`, which Claude Code does not read for MCP.** User scope lives in `~/.claude.json` (`claude mcp add --scope user`). *(Inferred from settings reference; verify.)*
4. **Session-row noise:** create the session row lazily on first tool call (or from hook events), not on every server start.
5. **Pinned model** `claude-haiku-4-5-20251001` in two files → make configurable.
6. **Transcript parser hardening:** format is documented as internal and changing (2.1.300 added per-request system-prompt/tool records; 2.1.208 shrank transcripts). Whitelist message types; also read `<session>/subagents/*.jsonl`.

## 2. Platform changes that matter (Claude Code / MCP)

| Change | Since | Use for us |
|---|---|---|
| **Plugins + marketplaces** (`.claude-plugin/plugin.json`, bundled `.mcp.json`, `hooks/hooks.json`, `skills/`, `${CLAUDE_PLUGIN_DATA}`) | 2.0.12; data dir 2.1.78 | Ship as a plugin. Replaces most of what `init` hand-edits; one-line install; every top competitor ships this way. |
| **SessionStart `additionalContext`** (≤10k chars per string; `source` = startup/resume/clear/compact/fork) | — | Inject relevant decisions automatically instead of hoping the agent calls `get_stats`. |
| **UserPromptSubmit** context injection (30s timeout); **`mcp_tool` hook type** | mcp_tool 2.1.118 | Per-prompt recall from our own MCP tool, budget-capped. |
| **PreToolUse** on Edit/Write | — | Show decisions anchored to the file about to change. |
| **PreCompact / PostCompact** (`compact_summary`) | PostCompact 2.1.76 | Capture decisions at compaction (already summarized, cheaper). PreCompact stdout can steer the summary to keep decisions. |
| **Native auto memory** (`~/.claude/projects/<p>/memory/MEMORY.md`; type `project` explicitly covers "decisions") | 2.1.59 (Feb 2026), on by default | Direct overlap. Position as *structured, searchable, code-anchored, team-shareable* decisions; import from / dedupe against it. |
| **`.claude/rules/` with path-scoped frontmatter** | 2.0.64 | Better target than CLAUDE.md marker blocks: per-area rule files scoped by path. |
| **AGENTS.md read natively** | 2.1.277 | Cross-agent export target. |
| **Skills** (SKILL.md, hot reload, `context: fork`) | 2.0.20 / 2.1.0 | Ship "record a decision" and "review session" as skills. |
| **MCP in Claude Code**: resources as `@server:uri`, prompts as slash commands, `structuredContent`, `readOnlyHint` (parallel calls), `idempotentHint`, tool-search deferral (server instructions matter, 4,096-char cap) | various | Annotations + `outputSchema`; `memory://decision/{id}` resource template; `review_session` as a prompt; good server instructions. |
| **MCP spec 2026-07-28** (stateless; sampling/roots/logging deprecated); TS SDK v2 split packages | 2026-07 | Upgrade SDK (1.x line at 1.32.x; v2 is `@modelcontextprotocol/server`). Keep calling Haiku directly — don't adopt sampling. |
| **`claude -p --bare`** (skips hooks + auto memory) | 2.1.81 | Run extraction on the user's subscription instead of requiring an API key, without re-triggering our own hooks. |

## 3. Competitive landscape (late 2026)

| Tool | Model | Notes |
|---|---|---|
| claude-mem (~117k★, AGPL) | ~9 hooks capture every tool call → observations; 3-step progressive search; corpora; work-state | Analytics on by default, cloud/paid tiers. Top complaint: token burn, context noise. |
| agentmemory (~30k★, Apache) | 12 hooks; BM25+vector+graph RRF; supersede/versioning; decay; contradiction detection; 2k-token opt-in injection | Closest feature competitor. |
| mem0 (~69k★) | LLM extraction; Claude Code plugin needs cloud key | Local OpenMemory reportedly removed *(unverified)*. |
| Basic Memory (~4.6k★) | Markdown source of truth + SQLite index; relations graph | Session-start briefings, pre-compaction checkpoints. |
| memsearch, Supermemory, Letta Code, Graphiti/Zep | Stop-hook summaries / per-prompt recall / self-editing memory / bi-temporal graph | Supermemory keys memory by git remote; Graphiti uses validity windows. |
| Copilot memory | Memories cite code, validated against current branch; 90-day expiry; votes | Only tool doing **code-anchored staleness** — strongest idea to borrow. |
| Native: Claude auto memory, Codex memories; Cursor/Windsurf/Kilo moved to Rules/AGENTS.md | | Generic "notes" memory is becoming free and built-in. |

**Genuinely differentiated:** typed decision schema with lifecycle (rationale, alternatives, status, supersedes, decay); zero telemetry / MIT / fully local; *measured* ROI (competitors only claim it); managed CLAUDE.md sync. **Risk:** native auto memory absorbs generic session memory. **Defensible ground:** curated, code-anchored, staleness-checked decisions.

## 4. Recommended roadmap

### Phase 0 — ship what exists, fix capture (v0.4.1)
- Detached, `node`-direct SessionEnd capture; fix global MCP registration; lazy session rows; configurable model; parser hardening; publish.

### Phase 1 — push, don't pull (v0.5) — highest value
1. **SessionStart injection**: top-N relevant decisions (branch, recently touched files, recency) via `additionalContext`, hard char budget. Retire "call `get_stats` at start".
2. **File-scoped injection on PreToolUse(Edit|Write)**: decisions anchored to that path, shown once per session.
3. **Opt-in UserPromptSubmit recall** with relevance threshold + token cap.
4. **Progressive disclosure**: `query_memory` returns compact index (id, title, status, score); new `get_decisions(ids)` for full records.
5. **Compaction capture**: PreCompact/PostCompact hooks; PreCompact tells the summarizer to preserve decisions.
6. **Measure push**: extend ROI tracking to injected decisions so the ROI story covers it.

### Phase 2 — package & modernize (v0.6)
7. **Claude Code plugin + marketplace** (MCP + hooks + skills). Keep npm CLI for the dashboard.
8. MCP modernization: SDK upgrade, annotations, `outputSchema`, resource templates, prompts, server instructions.
9. Skills: `record-decision`, `review-session`, `memory-gardening`.

### Phase 3 — differentiate on decision quality (v0.7+)
10. **Code-anchored staleness**: store commit SHA at save; on retrieval flag "possibly stale" if anchored files changed since. Dashboard stale-review queue.
11. **Contradiction detection & consolidation**: embedding clusters + Haiku pass proposing supersede/merge; human approves in dashboard.
12. **Repo-native sharing**: two-way sync with `docs/adr/` (MADR) and path-scoped `.claude/rules/decisions-*.md`; AGENTS.md export. Team sharing via git, no cloud.
13. **Native auto-memory interop**: import `type: project` entries; avoid duplicating MEMORY.md.
14. **Privacy**: secret redaction + `<private>` spans before any LLM call; local extraction option (`claude -p --bare` or Ollama).
15. **Relations**: depends-on / conflicts-with links and validity windows; graph view.
16. **Backfill**: import existing ADRs and decision-bearing commit/PR messages.

### Deliberately not doing
- Capturing every tool call (claude-mem's noise/token-burn problem).
- Cloud sync, accounts, telemetry.
- MCP sampling (deprecated in the 2026-07-28 spec).

## Unverified items
- 1.5s SessionEnd budget killing our capture: from docs, not reproduced.
- `~/.claude/settings.json` `mcpServers` ignored: from settings reference, not tested.
- "Auto Dream" consolidation, mem0 OpenMemory removal, some star counts: secondary sources only.
