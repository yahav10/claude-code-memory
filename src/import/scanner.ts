import * as fs from 'fs';
import * as path from 'path';

export interface ScannedFile {
  filePath: string;
  sessionId: string;
  projectDir: string;
}

export interface ProjectBreakdown {
  dirName: string;
  sessionCount: number;
  newCount: number;
}

export interface ScanResult {
  totalFound: number;
  newSessions: number;
  alreadyImported: number;
  files: ScannedFile[];
  projects: ProjectBreakdown[];
}

export async function scanForSessions(
  projectsDir: string,
  importedSessionIds: Set<string>,
): Promise<ScanResult> {
  const files: ScannedFile[] = [];
  const projectMap = new Map<string, { total: number; newCount: number }>();

  let entries: string[];
  try {
    entries = fs.readdirSync(projectsDir);
  } catch {
    return { totalFound: 0, newSessions: 0, alreadyImported: 0, files: [], projects: [] };
  }

  for (const dirName of entries) {
    const dirPath = path.join(projectsDir, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const jsonlFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
    let dirTotal = 0;
    let dirNew = 0;

    for (const file of jsonlFiles) {
      const filePath = path.join(dirPath, file);
      const sessionId = quickExtractSessionId(filePath);
      if (!sessionId) continue;

      dirTotal++;
      if (!importedSessionIds.has(sessionId)) {
        dirNew++;
        files.push({ filePath, sessionId, projectDir: dirName });
      }
    }

    if (dirTotal > 0) {
      projectMap.set(dirName, { total: dirTotal, newCount: dirNew });
    }
  }

  const totalFound = Array.from(projectMap.values()).reduce((s, p) => s + p.total, 0);
  const alreadyImported = totalFound - files.length;

  const projects: ProjectBreakdown[] = Array.from(projectMap.entries()).map(([dirName, stats]) => ({
    dirName,
    sessionCount: stats.total,
    newCount: stats.newCount,
  }));

  return { totalFound, newSessions: files.length, alreadyImported, files, projects };
}

function quickExtractSessionId(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed);
      if (record.type === 'user' && record.sessionId) return record.sessionId;
    } catch {
      continue;
    }
  }
  return null;
}
