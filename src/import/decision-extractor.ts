import Anthropic from '@anthropic-ai/sdk';

export interface ExtractedDecision {
  title: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  consequences: string;
  tags: string[];
  files: string[];
}

export interface ExtractionResult {
  summary: string;
  decisions: ExtractedDecision[];
}

const EXTRACTION_PROMPT = `Analyze this Claude Code session transcript. Extract any architectural decisions, technical choices, or significant implementation decisions made during the conversation.

For each decision found, provide structured data. Only include meaningful technical decisions — skip trivial actions like "read a file" or "ran tests".

Return valid JSON with this exact structure:
{
  "summary": "One-sentence summary of what happened in this session",
  "decisions": [
    {
      "title": "Short descriptive title",
      "context": "Why this decision was needed",
      "decision": "What was decided",
      "rationale": "Why this approach was chosen",
      "alternatives": ["Other options that were considered or could have been used"],
      "consequences": "Impact or trade-offs of this decision",
      "tags": ["relevant", "category", "tags"],
      "files": ["affected/file/paths"]
    }
  ]
}

If no significant architectural or technical decisions were made, return:
{"summary": "...", "decisions": []}`;

let clientInstance: Anthropic | null = null;

function getClient(apiKey?: string): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic(apiKey ? { apiKey } : undefined);
  }
  return clientInstance;
}

export async function extractDecisions(
  transcript: string,
  apiKey?: string,
): Promise<ExtractionResult> {
  const client = getClient(apiKey);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\n---\n\nTRANSCRIPT:\n${transcript}`,
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || '',
      decisions: (parsed.decisions || []).map((d: any) => ({
        title: d.title || '',
        context: d.context || '',
        decision: d.decision || '',
        rationale: d.rationale || '',
        alternatives: Array.isArray(d.alternatives) ? d.alternatives : [],
        consequences: d.consequences || '',
        tags: Array.isArray(d.tags) ? d.tags : [],
        files: Array.isArray(d.files) ? d.files : [],
      })),
    };
  } catch {
    // If Haiku returns non-JSON, return empty
    return { summary: '', decisions: [] };
  }
}

// Reset client (for testing)
export function resetClient(): void {
  clientInstance = null;
}
