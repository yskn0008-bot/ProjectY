import {createGoogleAccessTokenProvider} from '../auth/google-runtime.js';
import type {YosRuntimeConfig} from '../config.js';
import type {FetchLike} from '../http.js';
import {OpenAIResponsesClient} from '../openai/responses-client.js';
import {YosOrchestrator} from '../orchestrator.js';
import {GoogleDriveClient} from '../sources/google-drive-client.js';
import {GoogleSheetsClient} from '../sources/google-sheets-client.js';
import {GoogleSourceProvider} from '../sources/google-source-provider.js';
import {createSourceRegistry} from './source-registry.js';
import type {RequestRuntimeContext, RequestRuntimeFactory, YosAnswerService} from './types.js';

export interface DefaultRequestRuntimeFactoryOptions {
  config: YosRuntimeConfig;
  responseSchema: Record<string, unknown>;
  fetchImpl?: FetchLike;
}

export class DefaultRequestRuntimeFactory implements RequestRuntimeFactory {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: DefaultRequestRuntimeFactoryOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async create(context: RequestRuntimeContext): Promise<YosAnswerService> {
    if (!context.requestId.trim()) throw new Error('requestId is required');
    if (!context.subjectHash.trim()) throw new Error('subjectHash is required');

    const accessTokenProvider = await createGoogleAccessTokenProvider(
      this.options.config.googleWorkloadAuth,
      context.vercelOidcToken
    );
    const sourceProvider = new GoogleSourceProvider(
      new GoogleDriveClient(this.fetchImpl),
      new GoogleSheetsClient(this.fetchImpl),
      {
        accessTokenProvider,
        registry: createSourceRegistry(this.options.config)
      }
    );
    const modelClient = new OpenAIResponsesClient({
      apiKey: this.options.config.openAiApiKey,
      model: this.options.config.openAiModel,
      safetyIdentifier: context.subjectHash,
      responseSchema: this.options.responseSchema,
      fetchImpl: this.fetchImpl,
      maxOutputTokens: this.options.config.limits.maxOutputTokens,
      liveMaxOutputTokens: this.options.config.limits.liveMaxOutputTokens
    });

    return new YosOrchestrator(sourceProvider, modelClient, {
      maxTotalCharacters: this.options.config.limits.maxContextCharacters,
      maxDocumentCharacters: this.options.config.limits.maxDocumentCharacters
    });
  }
}
