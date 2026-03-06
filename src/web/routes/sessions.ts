import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import { getSessionsList, getSessionDetail } from '../queries.js';

export function registerSessionRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/sessions', async (req) => {
    const q = req.query as Record<string, string>;
    return getSessionsList(deps.db, {
      offset: parseInt(q.offset || '0', 10),
      limit: Math.min(parseInt(q.limit || '20', 10), 100),
      sortBy: (q.sortBy as 'started_at' | 'decision_count') || 'started_at',
      sortOrder: (q.sortOrder as 'ASC' | 'DESC') || 'DESC',
    });
  });

  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = getSessionDetail(deps.db, id);
    if (!detail) return reply.code(404).send({ error: 'Session not found' });
    return detail;
  });
}
