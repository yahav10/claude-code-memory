import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractDecisions, resetClient } from '../../src/import/decision-extractor.js';

const mockCreate = vi.fn();

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

describe('Decision Extractor', () => {
  beforeEach(() => {
    resetClient();
    mockCreate.mockReset();
  });

  it('extracts decisions from transcript via Haiku', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          summary: 'Refactored auth module to use JWT tokens',
          decisions: [{
            title: 'Switch to JWT authentication',
            context: 'The existing session-based auth was not scalable',
            decision: 'Use JWT tokens with RS256 signing',
            rationale: 'JWT is stateless and works well with microservices',
            alternatives: ['Session cookies', 'OAuth2 only'],
            consequences: 'Need to manage token refresh and revocation',
            tags: ['auth', 'security', 'jwt'],
            files: ['src/auth.ts', 'src/middleware.ts'],
          }],
        }),
      }],
    });

    const transcript = 'USER: Refactor the auth module\nASSISTANT: I will switch to JWT...';
    const result = await extractDecisions(transcript);

    expect(result.summary).toBe('Refactored auth module to use JWT tokens');
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].title).toBe('Switch to JWT authentication');
    expect(result.decisions[0].tags).toContain('auth');
    expect(result.decisions[0].files).toContain('src/auth.ts');
  });

  it('returns empty decisions for trivial transcripts', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ summary: 'Quick question answered', decisions: [] }) }],
    });

    const transcript = 'USER: What is 2+2?\nASSISTANT: 4';
    const result = await extractDecisions(transcript);
    expect(result.decisions).toHaveLength(0);
    expect(result.summary).toBe('Quick question answered');
  });
});
