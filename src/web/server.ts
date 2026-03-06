import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
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
