-- Claude Code Project Memory Schema v1.0

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  summary TEXT,
  decision_count INTEGER DEFAULT 0,
  project_path TEXT,
  git_branch TEXT,
  message_count INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  source TEXT DEFAULT 'mcp'
);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  context TEXT,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  alternatives TEXT,
  consequences TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'deprecated', 'superseded')),
  superseded_by INTEGER REFERENCES decisions(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  session_id TEXT REFERENCES sessions(id),
  tags TEXT
);

CREATE TABLE IF NOT EXISTS decision_files (
  decision_id INTEGER REFERENCES decisions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (decision_id, file_path)
);

CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
  title,
  context,
  decision,
  rationale,
  alternatives,
  consequences
);

CREATE TRIGGER IF NOT EXISTS decisions_ai AFTER INSERT ON decisions BEGIN
  INSERT INTO decisions_fts(rowid, title, context, decision, rationale, alternatives, consequences)
  VALUES (new.id, new.title, COALESCE(new.context, ''), new.decision, new.rationale, COALESCE(new.alternatives, ''), COALESCE(new.consequences, ''));
END;

CREATE TRIGGER IF NOT EXISTS decisions_ad AFTER DELETE ON decisions BEGIN
  DELETE FROM decisions_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS decisions_au AFTER UPDATE ON decisions BEGIN
  DELETE FROM decisions_fts WHERE rowid = old.id;
  INSERT INTO decisions_fts(rowid, title, context, decision, rationale, alternatives, consequences)
  VALUES (new.id, new.title, COALESCE(new.context, ''), new.decision, new.rationale, COALESCE(new.alternatives, ''), COALESCE(new.consequences, ''));
END;

CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_files_decision ON decision_files(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_files_file ON decision_files(file_path);
