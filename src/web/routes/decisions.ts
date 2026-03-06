import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import { getDecisionsList, getDecisionDetail } from '../queries.js';

export function registerDecisionRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/decisions', async (req) => {
    const q = req.query as Record<string, string>;
    return getDecisionsList(deps.db, {
      offset: parseInt(q.offset || '0', 10),
      limit: Math.min(parseInt(q.limit || '20', 10), 100),
      status: q.status ? q.status.split(',') : undefined,
      tags: q.tags ? q.tags.split(',') : undefined,
      search: q.search || undefined,
      sortBy: (q.sortBy as 'created_at' | 'title') || 'created_at',
      sortOrder: (q.sortOrder as 'ASC' | 'DESC') || 'DESC',
    });
  });

  app.get('/api/decisions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = getDecisionDetail(deps.db, parseInt(id, 10));
    if (!detail) return reply.code(404).send({ error: 'Decision not found' });
    return detail;
  });

  app.patch('/api/decisions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { status?: string; superseded_by?: number };
    const numId = parseInt(id, 10);

    const existing = deps.db.prepare('SELECT id FROM decisions WHERE id = ?').get(numId);
    if (!existing) return reply.code(404).send({ error: 'Decision not found' });

    if (body.status) {
      deps.db.prepare('UPDATE decisions SET status = ? WHERE id = ?').run(body.status, numId);
    }
    if (body.superseded_by !== undefined) {
      deps.db.prepare('UPDATE decisions SET superseded_by = ? WHERE id = ?').run(body.superseded_by, numId);
    }

    return { success: true, id: numId };
  });
}
