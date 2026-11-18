// Model used for decision extraction and the analytics coach. Overridable so users can pin a
// model (or pick a cheaper/newer one) without waiting for a release.
export const DEFAULT_MODEL = 'claude-haiku-5-5';

export function getModel(): string {
  return process.env.CLAUDE_SESSION_MEMORY_MODEL?.trim() || DEFAULT_MODEL;
}
