import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import * as os from 'os';
import * as path from 'path';
import { scanForSessions } from '../../import/scanner.js';
import { runImportPipeline } from '../../import/pipeline.js';

function getProjectsDir(): string {
  return process.env.CCM_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
}

export function registerImportSessionsRoutes(app: FastifyInstance, deps: AppDeps): void {
  // Scan — read-only, no DB writes
  app.post('/api/import/scan', async () => {
    const existingRows = deps.db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>;
    const importedIds = new Set(existingRows.map(r => r.id));
    const result = await scanForSessions(getProjectsDir(), importedIds);
    return result;
  });

  // Run full import
  app.post('/api/import/run', async (request) => {
    const body = request.body as { skipExtraction?: boolean; apiKey?: string } | null;
    let lastProgress: any = {};

    await runImportPipeline({
      db: deps.db,
      projectsDir: getProjectsDir(),
      skipExtraction: body?.skipExtraction,
      apiKey: body?.apiKey,
      onProgress: (p) => { lastProgress = p; },
    });

    return {
      sessionsImported: lastProgress.sessionsImported || 0,
      decisionsExtracted: lastProgress.decisionsExtracted || 0,
      message: lastProgress.message || 'Done',
    };
  });
}
