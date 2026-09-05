import type {FetchLike} from '../http.js';
import {ModelFailure} from './model-failure.js';
import {classifyModelRequestStatus} from './model-request-status.js';
import type {
  GroundedFact,
  MemoryCandidate,
  ModelClient,
  ModelInput,
  ModelOutput,
  ModelUsage
} from '../types.js';

export interface OpenAIResponsesClientOptions {
  apiKey: string;
  model?: string;
  safetyIdentifier: string;
  responseSchema: Record<string, unknown>;
  endpoint?: string;
  fetchImpl?: FetchLike;
  maxOutputTokens?: number;
  liveMaxOutputTokens?: number;
}

interface ResponsesApiResult {
  id?: string;
  model?: string;
  output?: Array<{
    type?: string;
    content?: Array<{type?: string; text?: string}>;
  }>;
  usage?: {
    input_tokens?: number;
    input_tokens_details?: {cached_tokens?: number};
    output_tokens?: number;
    output_tokens_details?: {reasoning_tokens?: number};
    total_tokens?: number;
  };
}

type Model429Reason =
  | 'rate_limit'
  | 'credit_balance_exhausted'
  | 'organization_usage_limit_exceeded'
  | 'organization_spend_limit_exceeded'
  | 'project_spend_limit_exceeded'
  | 'insufficient_quota'
  | 'unknown';

const QUOTA_429_CODES = new Set<Model429Reason>([
  'credit_balance_exhausted',
  'organization_usage_limit_exceeded',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded'
]);

export class OpenAIResponsesClient implements ModelClient {
  private readonly fetchImpl: FetchLike;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly liveMaxOutputTokens: number;

  constructor(private readonly options: OpenAIResponsesClientOptions) {
    if (!options.apiKey.trim()) throw new Error('OpenAI API key is required');
    if (!options.safetyIdentifier.trim()) throw new Error('safetyIdentifier is required');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.endpoint = options.endpoint ?? 'https://api.openai.com/v1/responses';
    this.model = options.model ?? 'gpt-5.6-terra';
    this.maxOutputTokens = positiveTokenLimit(options.maxOutputTokens ?? 5_000, 'maxOutputTokens');
    this.liveMaxOutputTokens = positiveTokenLimit(options.liveMaxOutputTokens ?? 1_500, 'liveMaxOutputTokens');
  }

  async generate(input: ModelInput): Promise<ModelOutput> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          instructions: input.instruction,
          input: [{role: 'user', content: [{
            type: 'input_text',
            text: [`REQUEST_ID=${input.requestId}`, `USER_TEXT=${input.userText}`, '', input.context].join('\n')
          }]}],
          reasoning: {effort: input.route.liveMode ? 'low' : 'medium'},
          max_output_tokens: input.route.liveMode ? this.liveMaxOutputTokens : this.maxOutputTokens,
          store: false,
          safety_identifier: this.options.safetyIdentifier,
          text: {
            verbosity: input.route.liveMode ? 'low' : 'medium',
            format: {type: 'json_schema', name: 'yos_answer', strict: true, schema: this.options.responseSchema}
          }
        })
      });
    } catch {
      throw new ModelFailure('model-request', 'network');
    }

    if (!response.ok) {
      if (response.status === 429) {
        const reason = await classify429Reason(response);
        console.error(JSON.stringify({level: 'error', event: 'openai_model_request_429', reason}));
      }
      throw new ModelFailure('model-request', classifyModelRequestStatus(response.status));
    }

    try {
      const payload = await response.json() as ResponsesApiResult;
      const outputText = extractOutputText(payload);
      const output = validateModelOutput(JSON.parse(outputText) as unknown);
      const modelUsage = parseModelUsage(payload, this.model);
      return {...output, ...(modelUsage ? {modelUsage} : {})};
    } catch {
      throw new ModelFailure('model-output-validate');
    }
  }
}

async function classify429Reason(response: Response): Promise<Model429Reason> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return hasRetryAfter(response.headers.get('retry-after')) ? 'rate_limit' : 'unknown';
  }
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return hasRetryAfter(response.headers.get('retry-after')) ? 'rate_limit' : 'unknown';
  }
  const code = typeof payload.error.code === 'string' ? payload.error.code : null;
  if (code && QUOTA_429_CODES.has(code as Model429Reason)) return code as Model429Reason;
  if (code === 'rate_limit_exceeded') return 'rate_limit';
  const type = typeof payload.error.type === 'string' ? payload.error.type : null;
  if (type === 'insufficient_quota') return 'insufficient_quota';
  if (type === 'rate_limit_error') return 'rate_limit';
  return hasRetryAfter(response.headers.get('retry-after')) ? 'rate_limit' : 'unknown';
}

function hasRetryAfter(value: string | null): boolean {
  if (!value) return false;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return true;
  return Number.isFinite(Date.parse(value));
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

export function parseModelUsage(payload: ResponsesApiResult, fallbackModel: string): ModelUsage | undefined {
  if (!payload.usage) return undefined;
  const inputTokens = nonNegativeInteger(payload.usage.input_tokens, 'input_tokens');
  const cachedInputTokens = nonNegativeInteger(payload.usage.input_tokens_details?.cached_tokens ?? 0, 'cached_tokens');
  const outputTokens = nonNegativeInteger(payload.usage.output_tokens, 'output_tokens');
  const reasoningTokens = nonNegativeInteger(
    payload.usage.output_tokens_details?.reasoning_tokens ?? 0,
    'reasoning_tokens'
  );
  const totalTokens = nonNegativeInteger(payload.usage.total_tokens, 'total_tokens');
  return {
    model: payload.model?.trim() || fallbackModel,
    ...(payload.id?.trim() ? {responseId: payload.id} : {}),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens
  };
}

function validateModelOutput(value: unknown): ModelOutput {
  if (!isRecord(value)) throw new Error('Model output must be an object');
  if (typeof value.answer !== 'string') throw new Error('Model output answer must be a string');
  if (!isGroundedFactArray(value.facts)) {
    throw new Error('Model output facts must contain text and non-empty sourceIds');
  }
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

function isGroundedFactArray(value: unknown): value is GroundedFact[] {
  return Array.isArray(value) && value.every((item) => {
    if (!isRecord(item) || typeof item.text !== 'string' || !item.text.trim()) return false;
    return Array.isArray(item.sourceIds)
      && item.sourceIds.length > 0
      && item.sourceIds.every((sourceId) => typeof sourceId === 'string' && sourceId.trim().length > 0);
  });
}

function positiveTokenLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 128_000) {
    throw new Error(`${name} must be between 1 and 128000`);
  }
  return value;
}

function nonNegativeInteger(value: number | undefined, name: string): number {
  if (!Number.isSafeInteger(value) || (value ?? -1) < 0) {
    throw new Error(`OpenAI usage ${name} must be a non-negative integer`);
  }
  return value as number;
}
