import Anthropic from '@anthropic-ai/sdk';
import type { DecisionQualityMetrics, WorkPatternMetrics, CodebaseMetrics } from './queries.js';

export interface CoachInput {
  quality: DecisionQualityMetrics;
  patterns: WorkPatternMetrics;
  codebase: CodebaseMetrics;
}

export interface CoachResult {
  insights: string[];
  generatedAt: string;
  error?: string;
}

const COACH_PROMPT = `You are a developer coach analyzing a software developer's architectural decision-making patterns. Based on the metrics below, provide 3-5 specific, actionable insights to help them improve.

Rules:
- Be specific — reference actual numbers from the data
- Each insight should suggest a concrete action or highlight a strength
- Focus on growth: what they're doing well and what they could improve
- Keep each insight to 1-2 sentences
- Return JSON only: {"insights": ["insight 1", "insight 2", ...]}
- No markdown fences`;

let clientInstance: Anthropic | null = null;
let cache: { result: CoachResult; expiry: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getClient(apiKey?: string): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic(apiKey ? { apiKey } : undefined);
  }
  return clientInstance;
}

export async function generateCoachInsights(input: CoachInput, apiKey?: string): Promise<CoachResult> {
  // Check cache
  if (cache && Date.now() < cache.expiry) {
    return cache.result;
  }

  const metricsText = `
DECISION QUALITY:
- Total decisions: ${input.quality.totalDecisions}
- Alternatives documented: ${input.quality.alternativesCoverage}%
- Average rationale length: ${input.quality.avgRationaleLength} characters
- Consequences documented: ${input.quality.consequencesTracking}%
- Decisions later revised (deprecated/superseded): ${input.quality.revisitRate}%

WORK PATTERNS:
- Total sessions: ${input.patterns.totalSessions}
- Average decisions per session: ${input.patterns.avgDecisionsPerSession.toFixed(1)}
- Sessions with zero decisions: ${input.patterns.zeroDecisionSessions}
- Top tags: ${input.codebase.topTags.slice(0, 10).map(t => `${t.tag}(${t.count})`).join(', ') || 'none'}

CODEBASE:
- Files with decisions: ${input.codebase.totalFiles}
- Architecture hotspots: ${input.codebase.hotspots.slice(0, 5).map(h => `${h.filePath}(${h.decisionCount})`).join(', ') || 'none'}`;

  try {
    const client = getClient(apiKey);
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `${COACH_PROMPT}\n\n${metricsText}` }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonText = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(jsonText);

    const result: CoachResult = {
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      generatedAt: new Date().toISOString(),
    };

    cache = { result, expiry: Date.now() + CACHE_TTL };
    return result;
  } catch (err: any) {
    return { insights: [], generatedAt: new Date().toISOString(), error: err.message };
  }
}

export function resetCoachCache(): void {
  cache = null;
}

export function resetCoachClient(): void {
  clientInstance = null;
}
