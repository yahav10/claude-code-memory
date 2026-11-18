import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildTranscript } from '../../src/import/transcript-builder.js';
import { parseSessionFile } from '../../src/import/jsonl-parser.js';

// Claude Code (2.1.x) writes injected content as `isMeta` user records and adds bookkeeping
// record types (api-request, attachment, ...). None of it is something the user said.
describe('Claude Code injected / bookkeeping records', () => {
  let tmpDir: string;
  let file: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-meta-'));
    file = path.join(tmpDir, 'session.jsonl');
    const records = [
      { type: 'user', isMeta: true, sessionId: 's-meta', cwd: '/p', timestamp: '2026-11-01T00:00:00Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: /x\n# SKILL BODY' }] } },
      { type: 'api-request', timestamp: '2026-11-01T00:00:01Z', system: 'SYSTEM PROMPT TEXT' },
      { type: 'attachment', timestamp: '2026-11-01T00:00:01Z', attachment: { content: 'ATTACHMENT TEXT' } },
      { type: 'user', sessionId: 's-meta', cwd: '/p', timestamp: '2026-11-01T00:00:02Z',
        message: { role: 'user', content: 'Switch the cache to Redis' } },
      { type: 'user', isMeta: true, timestamp: '2026-11-01T00:00:03Z',
        message: { role: 'user', content: 'Another Claude session sent a message: SUBAGENT REPORT' } },
      { type: 'assistant', timestamp: '2026-11-01T00:00:04Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Using Redis for the cache.' }] } },
    ];
    fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('keeps isMeta and bookkeeping records out of the extraction transcript', async () => {
    const transcript = await buildTranscript(file);
    expect(transcript).toContain('USER: Switch the cache to Redis');
    expect(transcript).toContain('ASSISTANT: Using Redis for the cache.');
    for (const noise of ['SKILL BODY', 'SUBAGENT REPORT', 'SYSTEM PROMPT TEXT', 'ATTACHMENT TEXT']) {
      expect(transcript).not.toContain(noise);
    }
  });

  it('never picks an isMeta record as the first prompt', async () => {
    const meta = await parseSessionFile(file);
    expect(meta!.firstPrompt).toBe('Switch the cache to Redis');
  });
});
