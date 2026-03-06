import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import { getDatabaseInfo } from '../queries.js';

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
}
