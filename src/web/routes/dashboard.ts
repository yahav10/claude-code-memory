import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import { getDashboardStats, getActivityTimeline } from '../queries.js';

export function registerDashboardRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/dashboard', async () => {
    return getDashboardStats(deps.db);
  });

  app.get('/api/dashboard/timeline', async (req) => {
    const { days = '30' } = req.query as { days?: string };
    return getActivityTimeline(deps.db, parseInt(days, 10) || 30);
  });
}
