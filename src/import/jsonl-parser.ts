import * as fs from 'fs';
import * as readline from 'readline';

export interface SessionMetadata {
  sessionId: string;
  projectPath: string;
  gitBranch: string;
  cliVersion: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  toolCallCount: number;
  firstPrompt: string;
}

export async function parseSessionFile(filePath: string): Promise<SessionMetadata | null> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let sessionId = '';
  let projectPath = '';
  let gitBranch = '';
  let cliVersion = '';
  let firstTimestamp = '';
  let lastTimestamp = '';
  let messageCount = 0;
  let toolCallCount = 0;
  let firstPrompt = '';

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let record: any;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue; // skip malformed lines
    }

    // Track timestamps
    if (record.timestamp) {
      if (!firstTimestamp) firstTimestamp = record.timestamp;
      lastTimestamp = record.timestamp;
    }

    if (record.type === 'user') {
      messageCount++;
      if (!sessionId && record.sessionId) sessionId = record.sessionId;
      if (!projectPath && record.cwd) projectPath = record.cwd;
      if (!gitBranch && record.gitBranch) gitBranch = record.gitBranch;
      if (!cliVersion && record.version) cliVersion = record.version;

      // Extract first prompt text
      if (!firstPrompt && record.message?.content) {
        const content = record.message.content;
        if (typeof content === 'string') {
          firstPrompt = content;
        } else if (Array.isArray(content)) {
          const textBlock = content.find((b: any) => b.type === 'text');
          if (textBlock) firstPrompt = textBlock.text;
        }
      }
    } else if (record.type === 'assistant') {
      messageCount++;
      // Count tool_use blocks inside assistant messages
      if (record.message?.content && Array.isArray(record.message.content)) {
        for (const block of record.message.content) {
          if (block.type === 'tool_use') toolCallCount++;
        }
      }
    } else if (record.type === 'tool_use') {
      toolCallCount++;
    }
  }

  if (!sessionId) return null;

  return {
    sessionId,
    projectPath,
    gitBranch,
    cliVersion,
    startedAt: firstTimestamp,
    endedAt: lastTimestamp,
    messageCount,
    toolCallCount,
    firstPrompt: firstPrompt.slice(0, 500),
  };
}
