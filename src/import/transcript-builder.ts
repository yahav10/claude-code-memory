import * as fs from 'fs';
import * as readline from 'readline';

const DEFAULT_MAX_CHARS = 32000; // ~8K tokens at ~4 chars/token

export async function buildTranscript(filePath: string, maxChars: number = DEFAULT_MAX_CHARS): Promise<string> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const parts: string[] = [];
  const files = new Set<string>();
  let totalChars = 0;

  for await (const line of rl) {
    if (totalChars >= maxChars) break;

    const trimmed = line.trim();
    if (!trimmed) continue;

    let record: any;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (record.type === 'user') {
      const text = extractText(record.message?.content);
      if (text) {
        const entry = `USER: ${text}\n`;
        parts.push(entry);
        totalChars += entry.length;
      }
    } else if (record.type === 'assistant') {
      const text = extractText(record.message?.content);
      if (text) {
        const entry = `ASSISTANT: ${text}\n`;
        parts.push(entry);
        totalChars += entry.length;
      }
    } else if (record.type === 'file-history-snapshot') {
      const backups = record.snapshot?.trackedFileBackups;
      if (backups && typeof backups === 'object') {
        for (const fp of Object.keys(backups)) {
          files.add(fp);
        }
      }
    }
  }

  let transcript = '';
  if (files.size > 0) {
    transcript += `FILES MODIFIED: ${Array.from(files).join(', ')}\n\n`;
  }
  transcript += parts.join('\n');

  // Final truncation safety
  if (transcript.length > maxChars + 500) {
    transcript = transcript.slice(0, maxChars) + '\n\n[TRANSCRIPT TRUNCATED]';
  }

  return transcript;
}

function extractText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
  }
  return '';
}
