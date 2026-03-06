import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import { getDecisionQualityMetrics, getWorkPatternMetrics, getCodebaseMetrics } from '../queries.js';
import { generateCoachInsights, resetCoachCache } from '../analytics-coach.js';

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

  app.post('/api/analytics/coach', async (req) => {
    const body = req.body as { apiKey?: string } | null;
    const quality = getDecisionQualityMetrics(deps.db);
    const patterns = getWorkPatternMetrics(deps.db);
    const codebase = getCodebaseMetrics(deps.db);
    return generateCoachInsights({ quality, patterns, codebase }, body?.apiKey);
  });
}
