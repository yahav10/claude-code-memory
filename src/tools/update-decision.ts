import type Database from 'better-sqlite3';

interface UpdateDecisionArgs {
  id: number;
  status?: 'active' | 'deprecated' | 'superseded';
  superseded_by?: number;
  notes?: string;
}

export function handleUpdateDecision(
  db: Database.Database,
  args: UpdateDecisionArgs,
): { success: boolean; id: number; status: string } {
  const existing = db.prepare('SELECT id, status FROM decisions WHERE id = ?').get(args.id);
  if (!existing) {
    throw new Error(`Decision ${args.id} not found`);
  }

  const newStatus = args.status || (existing as any).status;

  db.prepare(`
    UPDATE decisions SET status = ?, superseded_by = ? WHERE id = ?
  `).run(newStatus, args.superseded_by || null, args.id);

  return { success: true, id: args.id, status: newStatus };
}
