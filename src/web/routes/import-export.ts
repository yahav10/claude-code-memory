import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';

export function registerImportExportRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/export', async (req, reply) => {
    const { format = 'json' } = req.query as { format?: string };

    const decisions = deps.db.prepare(`
      SELECT d.*, GROUP_CONCAT(df.file_path) as file_paths
      FROM decisions d
      LEFT JOIN decision_files df ON df.decision_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `).all() as any[];

    const sessions = deps.db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all();

    if (format === 'json') {
      return {
        version: '1.0',
        exported_at: new Date().toISOString(),
        decisions: decisions.map(d => ({
          ...d,
          tags: d.tags ? JSON.parse(d.tags) : [],
          alternatives: d.alternatives ? JSON.parse(d.alternatives) : [],
          files: d.file_paths ? d.file_paths.split(',') : [],
          file_paths: undefined,
        })),
        sessions,
      };
    }

    if (format === 'csv') {
      const header = 'id,title,decision,rationale,status,tags,created_at\n';
      const rows = decisions.map(d =>
        `${d.id},"${(d.title || '').replace(/"/g, '""')}","${(d.decision || '').replace(/"/g, '""')}","${(d.rationale || '').replace(/"/g, '""')}",${d.status},"${d.tags || ''}",${d.created_at}`
      ).join('\n');
      reply.type('text/csv');
      return header + rows;
    }

    if (format === 'markdown') {
      let md = `# Architectural Decisions Export\n\nExported: ${new Date().toISOString()}\n\n`;
      for (const d of decisions) {
        md += `## ${d.title}\n\n`;
        md += `**Status:** ${d.status} | **Date:** ${d.created_at}\n\n`;
        md += `**Decision:** ${d.decision}\n\n`;
        md += `**Rationale:** ${d.rationale}\n\n`;
        if (d.context) md += `**Context:** ${d.context}\n\n`;
        md += `---\n\n`;
      }
      reply.type('text/markdown');
      return md;
    }

    return reply.code(400).send({ error: 'Invalid format. Use json, csv, or markdown.' });
  });
}
