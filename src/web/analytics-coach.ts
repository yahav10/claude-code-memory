import Anthropic from '@anthropic-ai/sdk';
import type { DecisionQualityMetrics, WorkPatternMetrics, CodebaseMetrics, StructuredInsight } from './queries.js';

export interface CoachInput {
  quality: DecisionQualityMetrics;
  patterns: WorkPatternMetrics;
  codebase: CodebaseMetrics;
}

export interface CoachResult {
  insights: StructuredInsight[];
  generatedAt: string;
  error?: string;
}

const COACH_PROMPT = `You are a developer coach analyzing a software developer's architectural decision-making patterns. Based on the metrics below, provide exactly 3 structured insights.

Rules:
- Be specific — reference actual numbers from the data
- Each insight should suggest a concrete action or highlight a strength
- Focus on growth: what they're doing well and what they could improve
- Keep descriptions to 1-2 sentences
- Return JSON only, no markdown fences

Categories (pick the most relevant for each insight): "strategy", "habits", "docs", "architecture", "testing", "performance"

Priority levels: "high" (needs attention), "positive" (doing well), "recommendation" (suggestion)

Return format:
{"insights": [
  {"title": "Short Title", "description": "1-2 sentence explanation with specific numbers", "category": "strategy", "priority": "high"},
  {"title": "Short Title", "description": "...", "category": "habits", "priority": "positive"},
  {"title": "Short Title", "description": "...", "category": "docs", "priority": "recommendation"}
]}`;

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

    const insights: StructuredInsight[] = Array.isArray(parsed.insights)
      ? parsed.insights.map((i: any) => ({
          title: i.title || 'Insight',
          description: i.description || '',
          category: i.category || 'strategy',
          priority: i.priority || 'recommendation',
        }))
      : [];

    const result: CoachResult = {
      insights,
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
