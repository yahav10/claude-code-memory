import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { runImportPipeline } from '../import/pipeline.js';
import { scanForSessions } from '../import/scanner.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerDecisionRoutes } from './routes/decisions.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerImportExportRoutes } from './routes/import-export.js';
import { registerImportSessionsRoutes } from './routes/import-sessions.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';

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
  registerImportSessionsRoutes(app, deps);
  registerAnalyticsRoutes(app, deps);

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

  // Auto-import new sessions on startup, then every 5 minutes
  autoImport(deps.db).catch(() => {});
  const intervalId = setInterval(() => autoImport(deps.db).catch(() => {}), 5 * 60 * 1000);
  process.on('SIGINT', () => clearInterval(intervalId));
  process.on('SIGTERM', () => clearInterval(intervalId));

  return app;
}

async function autoImport(db: Database.Database): Promise<void> {
  const projectsDir = process.env.CCM_PROJECTS_DIR
    || join(homedir(), '.claude', 'projects');

  const imported = new Set(
    db.prepare('SELECT id FROM sessions').all().map((r: any) => r.id),
  );
  const scan = await scanForSessions(projectsDir, imported);
  if (scan.newSessions === 0) return;

  const row = db.prepare("SELECT value FROM settings WHERE key = 'anthropic_api_key'").get() as any;
  const apiKey = row?.value || process.env.ANTHROPIC_API_KEY;

  await runImportPipeline({
    db,
    projectsDir,
    skipExtraction: !apiKey,
    apiKey,
    concurrency: 2,
  });
}
