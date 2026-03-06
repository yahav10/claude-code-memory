import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export function registerHealthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/health', async () => {
    let version = '0.0.0';
    try {
      const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../../package.json');
      version = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
    } catch { /* ignore */ }

    return {
      status: 'ok',
      version,
      dbPath: deps.dbPath,
    };
  });
}
