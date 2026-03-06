import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/web/server.js';
import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase } from '../../src/database.js';

describe('Health endpoint', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-web-')));
    const dbPath = path.join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);
    app = await buildApp({ db, dbPath });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
  });
});
