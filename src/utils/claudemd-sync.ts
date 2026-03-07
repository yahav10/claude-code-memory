import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { getActiveDecisionsAboveConfidence } from './confidence.js';

const MARKER_START = '<!-- DECISIONS:START -->';
const MARKER_END = '<!-- DECISIONS:END -->';

export function generateDecisionsSection(db: Database.Database): string {
  const decisions = getActiveDecisionsAboveConfidence(db, 0.3);

  if (decisions.length === 0) {
    return [
      MARKER_START,
      '## Architectural Decisions',
      '_No active decisions recorded yet. Use `save_decision` to start tracking._',
      MARKER_END,
    ].join('\n');
  }

  // Group by first tag (or "General" if no tags)
  const groups = new Map<string, typeof decisions>();
  for (const d of decisions) {
    let group = 'General';
    if (d.tags) {
      try {
        const tags = JSON.parse(d.tags) as string[];
        if (tags.length > 0) group = tags[0];
      } catch { /* use General */ }
    }
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(d);
  }

  const lines: string[] = [
    MARKER_START,
    '## Architectural Decisions',
    `_Auto-generated from project memory — ${decisions.length} active decision${decisions.length !== 1 ? 's' : ''}_`,
    '',
  ];

  for (const [group, items] of groups) {
    lines.push(`### ${group.charAt(0).toUpperCase() + group.slice(1)}`);
    for (const d of items) {
      let tags = '';
      if (d.tags) {
        try {
          const parsed = JSON.parse(d.tags) as string[];
          if (parsed.length > 0) tags = ` [${parsed.join(', ')}]`;
        } catch { /* skip */ }
      }
      const line = `- **${d.title}** — ${d.decision}${tags}`;
      lines.push(line.length > 120 ? line.slice(0, 117) + '...' : line);
    }
    lines.push('');
  }

  lines.push('_Search with `query_memory` or update with `update_decision`_');
  lines.push(MARKER_END);

  return lines.join('\n');
}

export function syncClaudeMd(
  projectRoot: string,
  db: Database.Database,
): { updated: boolean; decisionsCount: number } {
  const section = generateDecisionsSection(db);
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  const decisions = getActiveDecisionsAboveConfidence(db, 0.3);

  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    const startIdx = content.indexOf(MARKER_START);
    const endIdx = content.indexOf(MARKER_END);

    if (startIdx !== -1 && endIdx !== -1) {
      // Replace between markers
      const before = content.slice(0, startIdx);
      const after = content.slice(endIdx + MARKER_END.length);
      fs.writeFileSync(claudeMdPath, before + section + after);
    } else {
      // Append markers
      fs.writeFileSync(claudeMdPath, content + '\n\n' + section + '\n');
    }
  } else {
    // Create new file
    fs.writeFileSync(claudeMdPath, `# ${path.basename(projectRoot)}\n\n${section}\n`);
  }

  return { updated: true, decisionsCount: decisions.length };
}
