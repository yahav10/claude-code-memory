#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initDatabase, getDbPath } from './database.js';
import { generateSessionId, generateSessionSummary } from './utils.js';
import { handleSaveDecision } from './tools/save-decision.js';
import { handleQueryMemory } from './tools/query-memory.js';
import { handleListRecent } from './tools/list-recent.js';
import { handleUpdateDecision } from './tools/update-decision.js';
import { handleGetStats } from './tools/get-stats.js';

const dbPath = getDbPath();
const db = initDatabase(dbPath);
const currentSessionId = generateSessionId();

// Register session
db.prepare('INSERT INTO sessions (id) VALUES (?)').run(currentSessionId);
console.error(`[project-memory] Session ${currentSessionId} started`);
console.error(`[project-memory] Database: ${dbPath}`);

const server = new McpServer({
  name: 'project-memory',
  version: '0.1.0',
});

// --- save_decision ---
// @ts-ignore — MCP SDK generic depth issue with many optional zod fields
server.tool(
  'save_decision',
  'Save an architectural decision made during this session',
  {
    title: z.string().describe('Brief title (e.g., "Use JWT for auth")'),
    decision: z.string().describe('What was chosen'),
    rationale: z.string().describe('WHY it was chosen (most important)'),
    context: z.string().optional().describe('What prompted this decision'),
    alternatives: z.array(z.string()).optional().describe('What else was considered'),
    consequences: z.string().optional().describe('Trade-offs and implications'),
    files: z.array(z.string()).optional().describe('Files this decision affects'),
    tags: z.array(z.string()).optional().describe('Categories (e.g., auth, database)'),
  },
  async (args) => {
    try {
      const result = handleSaveDecision(db, currentSessionId, args);
      return {
        content: [{
          type: 'text' as const,
          text: `Decision saved (ID: ${result.id})\n\nTitle: ${result.title}\nDecision: ${args.decision}\nRationale: ${args.rationale}`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
      };
    }
  },
);

// --- query_memory ---
server.tool(
  'query_memory',
  'Search for decisions using natural language',
  {
    query: z.string().describe('Natural language question (e.g., "Why JWT?")'),
    limit: z.number().optional().default(5).describe('Max results to return'),
  },
  async (args) => {
    try {
      const { results, query } = handleQueryMemory(db, currentSessionId, args);

      if (results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No decisions found matching: "${query}"` }],
        };
      }

      let text = `Found ${results.length} decision(s) for: "${query}"\n\n`;
      for (const r of results) {
        text += `## Decision #${r.id}: ${r.title}\n`;
        text += `**Decision**: ${r.decision}\n`;
        text += `**Rationale**: ${r.rationale}\n`;
        if (r.alternatives) {
          try {
            const alts = JSON.parse(r.alternatives);
            text += `**Alternatives**: ${alts.join(', ')}\n`;
          } catch { /* skip */ }
        }
        if (r.consequences) text += `**Consequences**: ${r.consequences}\n`;
        if (r.affected_files) text += `**Files**: ${r.affected_files}\n`;
        text += `**Created**: ${r.created_at}\n\n`;
      }

      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
      };
    }
  },
);

// --- list_recent ---
server.tool(
  'list_recent',
  'List recent decisions from current or past sessions',
  {
    session: z.string().optional().describe('Session ID filter (omit for all sessions)'),
    limit: z.number().optional().default(10).describe('Max results'),
  },
  async (args) => {
    try {
      const { results } = handleListRecent(db, currentSessionId, args);

      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No recent decisions found' }] };
      }

      let text = `Recent decisions (${results.length}):\n\n`;
      for (const r of results as any[]) {
        text += `${r.id}. **${r.title}**\n   ${r.decision}\n   ${r.created_at}\n\n`;
      }

      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
      };
    }
  },
);

// --- update_decision ---
// @ts-ignore — MCP SDK generic depth issue with optional zod enum
server.tool(
  'update_decision',
  'Update or deprecate an existing decision',
  {
    id: z.number().describe('Decision ID to update'),
    status: z.enum(['active', 'deprecated', 'superseded']).optional().describe('New status'),
    superseded_by: z.number().optional().describe('ID of decision that replaces this one'),
    notes: z.string().optional().describe('Update notes'),
  },
  async (args) => {
    try {
      const result = handleUpdateDecision(db, args);
      return {
        content: [{
          type: 'text' as const,
          text: `Decision ${result.id} updated\nStatus: ${result.status}${args.notes ? '\nNotes: ' + args.notes : ''}`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
      };
    }
  },
);

// --- get_stats ---
server.tool(
  'get_stats',
  'Get project memory statistics (call at session start for context)',
  {},
  async () => {
    try {
      const stats = handleGetStats(db);
      let text = `Project Memory Statistics\n`;
      text += `${'─'.repeat(40)}\n`;
      text += `Decisions:  ${stats.totalDecisions} total`;
      if (stats.totalDecisions > 0) {
        text += ` (${stats.active} active, ${stats.deprecated} deprecated, ${stats.superseded} superseded)`;
      }
      text += `\nSessions:   ${stats.totalSessions}\n`;
      text += `Last activity: ${stats.lastActivity || 'none'}\n`;
      if (stats.topTags.length > 0) {
        text += `Top tags:   ${stats.topTags.map(t => `${t.tag} (${t.count})`).join(', ')}\n`;
      }
      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
      };
    }
  },
);

// --- Graceful shutdown ---
process.on('SIGINT', () => {
  const summary = generateSessionSummary(db, currentSessionId);
  db.prepare('UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, summary = ? WHERE id = ?')
    .run(summary, currentSessionId);
  console.error(`[project-memory] Session ended: ${summary}`);
  db.close();
  process.exit(0);
});

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
