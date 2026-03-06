import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import { getDecisionQualityMetrics, getWorkPatternMetrics, getCodebaseMetrics } from '../queries.js';

export function registerAnalyticsRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/analytics/quality', async () => {
    return getDecisionQualityMetrics(deps.db);
  });

  app.get('/api/analytics/patterns', async () => {
    return getWorkPatternMetrics(deps.db);
  });

  app.get('/api/analytics/codebase', async () => {
    return getCodebaseMetrics(deps.db);
  });
}
