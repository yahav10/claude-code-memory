import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  migrateSessionsTable(db);
  migrateDecisionsTable(db);

  return db;
}

function migrateSessionsTable(db: Database.Database): void {
  const columns = db.pragma('table_info(sessions)') as Array<{ name: string }>;
  const existing = new Set(columns.map(c => c.name));

  const migrations: [string, string][] = [
    ['project_path', 'ALTER TABLE sessions ADD COLUMN project_path TEXT'],
    ['git_branch', 'ALTER TABLE sessions ADD COLUMN git_branch TEXT'],
    ['message_count', 'ALTER TABLE sessions ADD COLUMN message_count INTEGER DEFAULT 0'],
    ['tool_call_count', 'ALTER TABLE sessions ADD COLUMN tool_call_count INTEGER DEFAULT 0'],
    ['source', "ALTER TABLE sessions ADD COLUMN source TEXT DEFAULT 'mcp'"],
  ];

  for (const [col, sql] of migrations) {
    if (!existing.has(col)) db.exec(sql);
  }
}

function migrateDecisionsTable(db: Database.Database): void {
  const columns = db.pragma('table_info(decisions)') as Array<{ name: string }>;
  const existing = new Set(columns.map(c => c.name));

  if (!existing.has('confidence')) {
    db.exec('ALTER TABLE decisions ADD COLUMN confidence REAL DEFAULT 1.0');
  }
}

export function findProjectRoot(): string {
  let dir = process.cwd();

  while (dir !== path.parse(dir).root) {
    if (
      fs.existsSync(path.join(dir, '.git')) ||
      fs.existsSync(path.join(dir, 'CLAUDE.md')) ||
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return process.cwd();
}

export function getDbPath(): string {
  const projectRoot = process.env.PROJECT_ROOT || findProjectRoot();
  return path.join(projectRoot, '.claude', 'project-memory.db');
}
