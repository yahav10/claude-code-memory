import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCoachInsights, resetCoachCache, resetCoachClient } from '../../src/web/analytics-coach.js';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

describe('Analytics Coach', () => {
  beforeEach(() => {
    resetCoachCache();
    resetCoachClient();
    mockCreate.mockReset();
  });

  it('generates insights from metrics data', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({
        insights: [
          'You document alternatives in 80% of decisions — strong practice.',
          'Consider adding consequences to more decisions for better traceability.',
        ],
      }) }],
    });

    const result = await generateCoachInsights({
      quality: { totalDecisions: 10, alternativesCoverage: 80, avgRationaleLength: 120, consequencesTracking: 40, revisitRate: 20 },
      patterns: { totalSessions: 5, avgDecisionsPerSession: 2, zeroDecisionSessions: 1, decisionDensity: [], tagTrends: [] },
      codebase: { hotspots: [], topTags: [{ tag: 'auth', count: 5 }], totalFiles: 10 },
    });

    expect(result.insights).toHaveLength(2);
    expect(result.insights[0]).toContain('80%');
  });

  it('returns cached result on second call', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ insights: ['Cached insight'] }) }],
    });

    const first = await generateCoachInsights({
      quality: { totalDecisions: 1, alternativesCoverage: 0, avgRationaleLength: 50, consequencesTracking: 0, revisitRate: 0 },
      patterns: { totalSessions: 1, avgDecisionsPerSession: 1, zeroDecisionSessions: 0, decisionDensity: [], tagTrends: [] },
      codebase: { hotspots: [], topTags: [], totalFiles: 0 },
    });
    const second = await generateCoachInsights({
      quality: { totalDecisions: 1, alternativesCoverage: 0, avgRationaleLength: 50, consequencesTracking: 0, revisitRate: 0 },
      patterns: { totalSessions: 1, avgDecisionsPerSession: 1, zeroDecisionSessions: 0, decisionDensity: [], tagTrends: [] },
      codebase: { hotspots: [], topTags: [], totalFiles: 0 },
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(second.insights).toEqual(first.insights);
  });

  it('handles API errors gracefully', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API down'));

    const result = await generateCoachInsights({
      quality: { totalDecisions: 0, alternativesCoverage: 0, avgRationaleLength: 0, consequencesTracking: 0, revisitRate: 0 },
      patterns: { totalSessions: 0, avgDecisionsPerSession: 0, zeroDecisionSessions: 0, decisionDensity: [], tagTrends: [] },
      codebase: { hotspots: [], topTags: [], totalFiles: 0 },
    });

    expect(result.insights).toEqual([]);
    expect(result.error).toBe('API down');
  });
});
