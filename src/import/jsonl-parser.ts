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

/** Strip XML-like tags and system noise from user message text */
export function cleanPromptText(raw: string): string {
  // Strip XML-like tags: <tag>...</tag> and self-closing <tag/>
  let text = raw.replace(/<[^>]+>[^<]*<\/[^>]+>/g, '').replace(/<[^>]+\/>/g, '');
  // Strip remaining unclosed tags like <system-reminder> or <ide_opened_file>
  text = text.replace(/<[a-zA-Z_-]+>/g, '');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** Check if a message looks like a system-generated prompt rather than a real user message */
function isSystemPrompt(text: string): boolean {
  const systemPrefixes = [
    'You are a JSON generator',
    'You are scoring the relevance',
    'Generate a creative',
    'Project context:\n',
    'Caveat: The messages below',
    'Base directory for this skill:',
    'Use the superpowers:',
    'Unknown skill:',
    'The user just ran /',
    'Perfect! Now I have comprehensive',
  ];
  return systemPrefixes.some(p => text.startsWith(p));
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

      // Extract best user prompt (skip system-generated messages)
      if (record.message?.content) {
        let rawText = '';
        const content = record.message.content;
        if (typeof content === 'string') {
          rawText = content;
        } else if (Array.isArray(content)) {
          const textBlock = content.find((b: any) => b.type === 'text');
          if (textBlock) rawText = textBlock.text;
        }

        if (rawText) {
          const cleaned = cleanPromptText(rawText);
          if (cleaned) {
            const isSys = isSystemPrompt(rawText) || isSystemPrompt(cleaned);
            if (!firstPrompt) {
              firstPrompt = cleaned;
            } else if (!isSys && cleaned.length > 2 && isSystemPrompt(firstPrompt)) {
              // Found a real user prompt — prefer it over system-generated first message
              firstPrompt = cleaned;
            }
          }
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
