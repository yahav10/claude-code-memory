import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { registerHealthRoutes } from './routes/health.js';

export interface AppDeps {
  db: Database.Database;
  dbPath: string;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Register routes
  registerHealthRoutes(app, deps);

  return app;
}
