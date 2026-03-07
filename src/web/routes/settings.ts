import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import { getDatabaseInfo, getSetting, setSetting, deleteSetting } from '../queries.js';

export function registerSettingsRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/settings/database', async () => {
    return getDatabaseInfo(deps.db, deps.dbPath);
  });

  app.post('/api/settings/vacuum', async () => {
    deps.db.pragma('wal_checkpoint(TRUNCATE)');
    deps.db.exec('VACUUM');
    return { success: true };
  });

  app.post('/api/settings/rebuild-fts', async () => {
    deps.db.exec("INSERT INTO decisions_fts(decisions_fts) VALUES('rebuild')");
    return { success: true };
  });

  app.post('/api/settings/reset', async (_req, reply) => {
    return reply.code(501).send({ error: 'Not implemented via API for safety' });
  });

  app.get('/api/settings/api-key', async () => {
    const key = getSetting(deps.db, 'anthropic_api_key');
    return { configured: !!key, maskedKey: key ? `${key.slice(0, 12)}...${key.slice(-4)}` : null };
  });

  app.put('/api/settings/api-key', async (req) => {
    const body = req.body as { apiKey: string } | null;
    if (!body?.apiKey) {
      deleteSetting(deps.db, 'anthropic_api_key');
      return { configured: false };
    }
    setSetting(deps.db, 'anthropic_api_key', body.apiKey);
    return { configured: true, maskedKey: `${body.apiKey.slice(0, 12)}...${body.apiKey.slice(-4)}` };
  });
}
