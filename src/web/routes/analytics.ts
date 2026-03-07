import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import { getDecisionQualityMetrics, getWorkPatternMetrics, getCodebaseMetrics, getSetting, saveCoachSummary, getCoachSummaries, getLatestCoachSummary } from '../queries.js';
import { generateCoachInsights } from '../analytics-coach.js';

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
    const apiKey = body?.apiKey || getSetting(deps.db, 'anthropic_api_key') || undefined;
    const quality = getDecisionQualityMetrics(deps.db);
    const patterns = getWorkPatternMetrics(deps.db);
    const codebase = getCodebaseMetrics(deps.db);
    const result = await generateCoachInsights({ quality, patterns, codebase }, apiKey);

    // Save to DB if generation succeeded
    if (result.insights.length > 0 && !result.error) {
      const id = saveCoachSummary(deps.db, result.insights, { quality, patterns, codebase });
      return { ...result, id };
    }

    return result;
  });

  app.get('/api/analytics/coach/history', async (req) => {
    const query = req.query as { limit?: string };
    const limit = parseInt(query.limit || '20', 10);
    const rows = getCoachSummaries(deps.db, limit);
    return rows.map(r => ({
      id: r.id,
      insights: JSON.parse(r.insights),
      metricsSnapshot: r.metrics_snapshot ? JSON.parse(r.metrics_snapshot) : null,
      createdAt: r.created_at,
    }));
  });

  app.get('/api/analytics/coach/latest', async () => {
    const row = getLatestCoachSummary(deps.db);
    if (!row) return null;
    return {
      id: row.id,
      insights: JSON.parse(row.insights),
      metricsSnapshot: row.metrics_snapshot ? JSON.parse(row.metrics_snapshot) : null,
      createdAt: row.created_at,
    };
  });
}
