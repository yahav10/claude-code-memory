import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseSessionFile, cleanPromptText, type SessionMetadata } from '../../src/import/jsonl-parser.js';

describe('cleanPromptText', () => {
  it('strips paired XML-like tags', () => {
    expect(cleanPromptText('<command-message>foo</command-message> bar')).toBe('bar');
  });

  it('strips unclosed tags', () => {
    expect(cleanPromptText('<ide_opened_file>The user opened file.txt')).toBe('The user opened file.txt');
  });

  it('collapses whitespace', () => {
    expect(cleanPromptText('hello   \n\n  world')).toBe('hello world');
  });

  it('handles clean text unchanged', () => {
    expect(cleanPromptText('Fix the auth bug')).toBe('Fix the auth bug');
  });
});

describe('JSONL Parser', () => {
  let tmpDir: string;
  let sampleFile: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-jsonl-'));
    sampleFile = path.join(tmpDir, 'test-session.jsonl');

    const records = [
      JSON.stringify({
        type: 'user',
        uuid: 'msg-001',
        parentUuid: null,
        sessionId: 'sess-abc-123',
        timestamp: '2026-02-15T10:00:00.000Z',
        version: '2.1.34',
        cwd: '/home/user/my-project',
        gitBranch: 'main',
        message: { role: 'user', content: [{ type: 'text', text: 'Help me refactor the auth module' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'msg-002',
        parentUuid: 'msg-001',
        sessionId: 'sess-abc-123',
        timestamp: '2026-02-15T10:00:05.000Z',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-5-20250929',
          content: [
            { type: 'text', text: 'I will help you refactor the auth module.' },
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/home/user/my-project/src/auth.ts' } },
          ],
          usage: { input_tokens: 500, output_tokens: 200 },
        },
      }),
      JSON.stringify({
        type: 'tool_result',
        uuid: 'msg-003',
        parentUuid: 'tu-1',
        timestamp: '2026-02-15T10:00:06.000Z',
        toolName: 'Read',
        result: 'export function login() {}',
        isError: false,
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'msg-004',
        parentUuid: 'msg-003',
        sessionId: 'sess-abc-123',
        timestamp: '2026-02-15T10:01:00.000Z',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-5-20250929',
          content: [{ type: 'text', text: 'Here is the refactored auth module.' }],
          usage: { input_tokens: 300, output_tokens: 400 },
        },
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'msg-005',
        parentUuid: 'msg-004',
        sessionId: 'sess-abc-123',
        timestamp: '2026-02-15T10:02:00.000Z',
        version: '2.1.34',
        cwd: '/home/user/my-project',
        gitBranch: 'main',
        message: { role: 'user', content: [{ type: 'text', text: 'Great, now add tests' }] },
      }),
    ];

    fs.writeFileSync(sampleFile, records.join('\n'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts session metadata from JSONL file', async () => {
    const meta = await parseSessionFile(sampleFile);
    expect(meta).not.toBeNull();
    expect(meta!.sessionId).toBe('sess-abc-123');
    expect(meta!.projectPath).toBe('/home/user/my-project');
    expect(meta!.gitBranch).toBe('main');
    expect(meta!.cliVersion).toBe('2.1.34');
    expect(meta!.startedAt).toBe('2026-02-15T10:00:00.000Z');
    expect(meta!.endedAt).toBe('2026-02-15T10:02:00.000Z');
    expect(meta!.messageCount).toBe(4); // 2 user + 2 assistant
    expect(meta!.toolCallCount).toBe(1);
    expect(meta!.firstPrompt).toBe('Help me refactor the auth module');
  });

  it('returns null for empty files', async () => {
    const emptyFile = path.join(tmpDir, 'empty.jsonl');
    fs.writeFileSync(emptyFile, '');
    const meta = await parseSessionFile(emptyFile);
    expect(meta).toBeNull();
  });

  it('strips XML-like tags from first prompt', async () => {
    const tagFile = path.join(tmpDir, 'tagged.jsonl');
    const lines = [
      JSON.stringify({
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'sess-tagged',
        timestamp: '2026-01-01T00:00:00.000Z',
        cwd: '/tmp',
        gitBranch: 'main',
        version: '2.0.0',
        message: { role: 'user', content: [{ type: 'text', text: '<command-message>superpowers:executing-plans</command-message> <command-name>/superpowers:executing-plans</command-name> <command-args>docs/plans/plan.md</command-args>' }] },
      }),
    ];
    fs.writeFileSync(tagFile, lines.join('\n'));
    const meta = await parseSessionFile(tagFile);
    expect(meta).not.toBeNull();
    expect(meta!.firstPrompt).not.toContain('<command-message>');
    expect(meta!.firstPrompt).not.toContain('<command-name>');
    expect(meta!.firstPrompt).not.toContain('<command-args>');
  });

  it('prefers real user prompt over system-generated first message', async () => {
    const sysFile = path.join(tmpDir, 'system-first.jsonl');
    const lines = [
      JSON.stringify({
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'sess-sys',
        timestamp: '2026-01-01T00:00:00.000Z',
        cwd: '/tmp',
        gitBranch: 'main',
        version: '2.0.0',
        message: { role: 'user', content: [{ type: 'text', text: 'You are a JSON generator. Summarize this text in JSON format.\n\nRULES:\n- Output ONLY valid JSON' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        sessionId: 'sess-sys',
        timestamp: '2026-01-01T00:00:05.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'msg-3',
        parentUuid: 'msg-2',
        sessionId: 'sess-sys',
        timestamp: '2026-01-01T00:01:00.000Z',
        cwd: '/tmp',
        gitBranch: 'main',
        version: '2.0.0',
        message: { role: 'user', content: [{ type: 'text', text: 'Fix the login bug on the dashboard' }] },
      }),
    ];
    fs.writeFileSync(sysFile, lines.join('\n'));
    const meta = await parseSessionFile(sysFile);
    expect(meta).not.toBeNull();
    expect(meta!.firstPrompt).toBe('Fix the login bug on the dashboard');
  });

  it('skips malformed JSON lines gracefully', async () => {
    const badFile = path.join(tmpDir, 'bad.jsonl');
    const lines = [
      'not valid json',
      JSON.stringify({
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'sess-bad',
        timestamp: '2026-01-01T00:00:00.000Z',
        cwd: '/tmp',
        gitBranch: 'dev',
        version: '2.0.0',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      }),
    ];
    fs.writeFileSync(badFile, lines.join('\n'));
    const meta = await parseSessionFile(badFile);
    expect(meta).not.toBeNull();
    expect(meta!.sessionId).toBe('sess-bad');
  });
});
