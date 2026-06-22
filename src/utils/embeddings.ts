import type Database from 'better-sqlite3';

// Local semantic search via a small sentence-embedding model (all-MiniLM-L6-v2, 384-dim).
// The model runs locally; @xenova/transformers is an optional dependency loaded lazily, and
// the model weights (~25MB) download once on first use then stay cached on disk. If the
// dependency is missing or fails to load, everything degrades gracefully to FTS keyword search.
//
// ponytail: brute-force cosine over all active decisions in JS — fine for thousands of rows.
// Swap to sqlite-vec only if a user's store grows large enough for the scan to matter.

// multi-qa model is tuned for asymmetric question→passage retrieval (our exact case): a typed
// question matched against stored decisions. 384-dim, same speed as all-MiniLM, better calibrated.
const MODEL = 'Xenova/multi-qa-MiniLM-L6-cos-v1';
// Floor tuned on multi-qa scores: unrelated queries land ~0.0–0.10, genuine matches ~0.18+.
// 0.15 favors precision — a false "memory" misleads the agent more than a missed weak match,
// which keyword search usually catches anyway. Real (longer) decisions score higher still.
const MIN_SCORE = 0.15;

let embedderPromise: Promise<((text: string) => Promise<Float32Array>) | null> | null = null;

async function getEmbedder(): Promise<((text: string) => Promise<Float32Array>) | null> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      // Indirect specifier: keeps this an optional runtime dependency the type-checker
      // doesn't try to resolve at build time.
      const moduleId = '@xenova/transformers';
      const mod: any = await import(moduleId);
      mod.env.allowLocalModels = false; // pull from the HF hub cache, not the cwd
      const pipe = await mod.pipeline('feature-extraction', MODEL);
      return async (text: string) => {
        const out = await pipe(text, { pooling: 'mean', normalize: true });
        return Float32Array.from(out.data as Float32Array);
      };
    })().catch(() => null); // missing dep / offline first-run / native failure → no semantic search
  }
  return embedderPromise;
}

/** True when semantic search is available (dependency present and model loaded). */
export async function embeddingsAvailable(): Promise<boolean> {
  return (await getEmbedder()) !== null;
}

export async function embedText(text: string): Promise<Float32Array | null> {
  const embed = await getEmbedder();
  if (!embed) return null;
  return embed(text);
}

export function vecToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function bufferToVec(buf: Buffer): Float32Array {
  // Copy so the view is float-aligned and independent of the source Buffer.
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/** Cosine similarity. Handles non-normalized inputs; returns 0 on length mismatch or zero vector. */
export function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function decisionText(d: { title: string; decision: string; rationale: string }): string {
  return `${d.title}\n${d.decision}\n${d.rationale}`;
}

/**
 * Backfill embeddings for decisions that don't have one yet. Returns the count embedded.
 * No-op (returns 0) when the embedder is unavailable. Bounded per call so a first run on a
 * large store doesn't stall a single query — leftover rows get picked up on the next call.
 */
export async function ensureEmbeddings(db: Database.Database, batchLimit = 200): Promise<number> {
  const embed = await getEmbedder();
  if (!embed) return 0;

  const rows = db.prepare(
    'SELECT id, title, decision, rationale FROM decisions WHERE embedding IS NULL LIMIT ?',
  ).all(batchLimit) as Array<{ id: number; title: string; decision: string; rationale: string }>;
  if (rows.length === 0) return 0;

  const update = db.prepare('UPDATE decisions SET embedding = ? WHERE id = ?');
  let count = 0;
  for (const r of rows) {
    const vec = await embed(decisionText(r));
    update.run(vecToBuffer(vec), r.id);
    count++;
  }
  return count;
}

export interface SemanticHit {
  id: number;
  title: string;
  decision: string;
  rationale: string;
  alternatives: string | null;
  consequences: string | null;
  created_at: string;
  semantic_score: number;
}

/** Embed the query and rank active decisions by cosine similarity. Returns [] if unavailable. */
export async function semanticSearch(
  db: Database.Database,
  query: string,
  limit = 5,
): Promise<SemanticHit[]> {
  await ensureEmbeddings(db);
  const qvec = await embedText(query);
  if (!qvec) return [];

  const rows = db.prepare(`
    SELECT id, title, decision, rationale, alternatives, consequences, created_at, embedding
    FROM decisions
    WHERE status = 'active' AND embedding IS NOT NULL
  `).all() as Array<SemanticHit & { embedding: Buffer }>;

  return rows
    .map(r => ({ row: r, score: cosineSim(qvec, bufferToVec(r.embedding)) }))
    .filter(s => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => {
      const { embedding, ...rest } = row;
      return { ...rest, semantic_score: score };
    });
}
