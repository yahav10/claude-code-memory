import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { registerHealthRoutes } from './routes/health.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerDecisionRoutes } from './routes/decisions.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerImportExportRoutes } from './routes/import-export.js';

export interface AppDeps {
  db: Database.Database;
  dbPath: string;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  registerHealthRoutes(app, deps);
  registerDashboardRoutes(app, deps);
  registerDecisionRoutes(app, deps);
  registerSessionRoutes(app, deps);
  registerSettingsRoutes(app, deps);
  registerImportExportRoutes(app, deps);

  return app;
}

export async function startWebServer(deps: AppDeps, options: { port: number; open: boolean }) {
  const app = await buildApp(deps);

  // Serve built Vue app if it exists
  const webDistPath = join(dirname(fileURLToPath(import.meta.url)), '../web-dist');
  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      wildcard: false,
    });
    // SPA fallback — serve index.html for non-API routes
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  const address = await app.listen({ port: options.port, host: '127.0.0.1' });
  console.log(`\n  Claude Code Memory Dashboard`);
  console.log(`  ${address}\n`);

  if (options.open) {
    const { exec } = await import('child_process');
    exec(`open ${address}`);
  }

  return app;
}
