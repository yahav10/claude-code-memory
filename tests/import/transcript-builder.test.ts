import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildTranscript } from '../../src/import/transcript-builder.js';

describe('Transcript Builder', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-transcript-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts user and assistant text, skips tool results', async () => {
    const file = path.join(tmpDir, 'session.jsonl');
    const records = [
      JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Refactor auth' }] } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'I will refactor auth using JWT.' }, { type: 'tool_use', id: 'tu1', name: 'Read', input: {} }] } }),
      JSON.stringify({ type: 'tool_result', timestamp: '2026-01-01T00:00:06Z', toolName: 'Read', result: 'file contents here which should be excluded' }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:10Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Done with the refactor.' }] } }),
    ];
    fs.writeFileSync(file, records.join('\n'));

    const transcript = await buildTranscript(file);
    expect(transcript).toContain('USER: Refactor auth');
    expect(transcript).toContain('ASSISTANT: I will refactor auth using JWT.');
    expect(transcript).toContain('ASSISTANT: Done with the refactor.');
    expect(transcript).not.toContain('file contents here');
  });

  it('truncates transcript to max tokens (~8K chars)', async () => {
    const file = path.join(tmpDir, 'long-session.jsonl');
    const longText = 'A'.repeat(2000);
    const records = [];
    for (let i = 0; i < 20; i++) {
      records.push(JSON.stringify({ type: 'user', timestamp: `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`, message: { role: 'user', content: [{ type: 'text', text: longText }] } }));
      records.push(JSON.stringify({ type: 'assistant', timestamp: `2026-01-01T00:${String(i).padStart(2, '0')}:05Z`, message: { role: 'assistant', content: [{ type: 'text', text: longText }] } }));
    }
    fs.writeFileSync(file, records.join('\n'));

    const transcript = await buildTranscript(file, 8000);
    expect(transcript.length).toBeLessThanOrEqual(8500); // some overhead for labels
  });

  it('includes file paths from file-history-snapshot', async () => {
    const file = path.join(tmpDir, 'files-session.jsonl');
    const records = [
      JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Fix bug' }] } }),
      JSON.stringify({ type: 'file-history-snapshot', snapshot: { trackedFileBackups: { 'src/auth.ts': {}, 'src/utils.ts': {} } } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Fixed it.' }] } }),
    ];
    fs.writeFileSync(file, records.join('\n'));

    const transcript = await buildTranscript(file);
    expect(transcript).toContain('src/auth.ts');
    expect(transcript).toContain('src/utils.ts');
  });
});
