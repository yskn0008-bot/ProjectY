import { assertOk, type FetchLike } from '../http.js';
import type { MemoryCandidate, ModelClient, ModelInput, ModelOutput } from '../types.js';

export interface OpenAIResponsesClientOptions {
  apiKey: string;
  model?: string;
  safetyIdentifier: string;
  responseSchema: Record<string, unknown>;
  endpoint?: string;
  fetchImpl?: FetchLike;
}

interface ResponsesApiResult {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

export class OpenAIResponsesClient implements ModelClient {
  private readonly fetchImpl: FetchLike;
  private readonly endpoint: string;
  private readonly model: string;

  constructor(private readonly options: OpenAIResponsesClientOptions) {
    if (!options.apiKey.trim()) throw new Error('OpenAI API key is required');
    if (!options.safetyIdentifier.trim()) throw new Error('safetyIdentifier is required');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.endpoint = options.endpoint ?? 'https://api.openai.com/v1/responses';
    this.model = options.model ?? 'gpt-5.6-terra';
  }

  async generate(input: ModelInput): Promise<ModelOutput> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        instructions: input.instruction,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  `REQUEST_ID=${input.requestId}`,
                  `USER_TEXT=${input.userText}`,
                  '',
                  input.context
                ].join('\n')
              }
            ]
          }
        ],
        reasoning: { effort: 'medium' },
        store: false,
        safety_identifier: this.options.safetyIdentifier,
        text: {
          verbosity: input.route.liveMode ? 'low' : 'medium',
          format: {
            type: 'json_schema',
            name: 'yos_answer',
            strict: true,
            schema: this.options.responseSchema
          }
        }
      })
    });

    await assertOk(response, 'OpenAI Responses request');
    const payload = await response.json() as ResponsesApiResult;
    const outputText = extractOutputText(payload);
    return validateModelOutput(JSON.parse(outputText) as unknown);
  }
}

export function extractOutputText(payload: ResponsesApiResult): string {
  for (const item of payload.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('OpenAI response did not contain output_text');
}

function validateModelOutput(value: unknown): ModelOutput {
  if (!isRecord(value)) throw new Error('Model output must be an object');
  if (typeof value.answer !== 'string') throw new Error('Model output answer must be a string');
  if (!isStringArray(value.facts)) throw new Error('Model output facts must be a string array');
  if (!isStringArray(value.assumptions)) throw new Error('Model output assumptions must be a string array');
  if (!isStringArray(value.unknowns)) throw new Error('Model output unknowns must be a string array');
  if (!Array.isArray(value.memoryCandidates)) throw new Error('Model output memoryCandidates must be an array');
  if (!(typeof value.nextAction === 'string' || value.nextAction === null)) {
    throw new Error('Model output nextAction must be string or null');
  }

  return {
    answer: value.answer,
    facts: value.facts,
    assumptions: value.assumptions,
    unknowns: value.unknowns,
    memoryCandidates: value.memoryCandidates as MemoryCandidate[],
    nextAction: value.nextAction
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
