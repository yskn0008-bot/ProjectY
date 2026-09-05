import {buildContext} from './context-builder.js';
import {detectConflicts} from './conflict-detector.js';
import {applyContextBudget, type ContextBudgetOptions} from './context-budget.js';
import {routeDomain} from './domain-router.js';
import {validateGroundedFacts} from './grounding.js';
import {validateMemoryCandidates} from './memory-candidates.js';
import {ModelFailure} from './openai/model-failure.js';
import type {ModelRequestStatus} from './openai/model-request-status.js';
import {sanitizeDocuments} from './privacy-filter.js';
import type {
  EvidenceItem,
  ModelClient,
  ModelInput,
  SourceDocument,
  SourceProvider,
  YosAnswer,
  YosRequest
} from './types.js';

const BASE_INSTRUCTION = [
  'あなたは一人の利用者専用AI YOSの判断エンジンである。',
  '安全、法令、信頼できる事実、長期的期待値、再現性、効率、本人の意思の順で判断する。',
  '資料が支持しない内容を補わない。',
  '確定、仮説、未確認、矛盾を分ける。',
  'factsは各項目を{text, sourceIds}で返し、使用したsource_idを必ず1件以上付ける。',
  'answer内の事実主張はfactsに含めた内容だけを使う。根拠がない内容はassumptionsかunknownsへ移す。',
  '正本やデータを変更せず、必要なら保存候補だけを返す。',
  '営業中モードでは結論を短くする。'
].join('\n');

export type AnswerFailureStage =
  | 'source-load'
  | 'context-build'
  | 'model-request'
  | 'model-output-validate';

export class AnswerFailure extends Error {
  readonly stage: AnswerFailureStage;
  readonly modelRequestStatus?: ModelRequestStatus;

  constructor(stage: AnswerFailureStage, modelRequestStatus?: ModelRequestStatus) {
    super('YOS answer failed');
    this.stage = stage;
    if (stage === 'model-request' && modelRequestStatus) this.modelRequestStatus = modelRequestStatus;
    this.name = 'AnswerFailure';
  }
}

async function atAnswerStage<T>(stage: AnswerFailureStage, operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new AnswerFailure(stage);
  }
}

function collectEvidence(documents: SourceDocument[]): EvidenceItem[] {
  return documents.flatMap((document) => document.evidence ?? []);
}

function assertRequest(request: YosRequest): void {
  if (!request.requestId.trim()) throw new Error('requestId is required');
  if (!request.userText.trim()) throw new Error('userText is required');
  if (Number.isNaN(Date.parse(request.currentTime))) throw new Error('currentTime must be ISO-8601 compatible');
}

export class YosOrchestrator {
  constructor(
    private readonly sourceProvider: SourceProvider,
    private readonly modelClient: ModelClient,
    private readonly contextBudget: ContextBudgetOptions = {}
  ) {}

  async answer(request: YosRequest): Promise<YosAnswer> {
    assertRequest(request);

    const route = routeDomain(request.userText);
    const [core, domain] = await atAnswerStage('source-load', () => Promise.all([
      this.sourceProvider.loadCoreSources(),
      this.sourceProvider.loadDomainSources(route, request)
    ]));

    const prepared = await atAnswerStage('context-build', () => {
      const allDocuments = deduplicateDocuments([...core, ...domain]);
      const privacy = sanitizeDocuments(allDocuments);
      const budget = applyContextBudget(privacy.documents, this.contextBudget);
      const conflicts = detectConflicts(collectEvidence(budget.documents));
      const context = buildContext(route, budget.documents, conflicts);
      return {privacy, budget, conflicts, context};
    });
    const {privacy, budget, conflicts, context} = prepared;

    const modelInput: ModelInput = {
      requestId: request.requestId,
      route,
      instruction: BASE_INSTRUCTION,
      userText: request.userText,
      context,
      sourceRefs: budget.documents.map((document) => document.source),
      conflicts
    };

    let modelOutput;
    try {
      modelOutput = await this.modelClient.generate(modelInput);
    } catch (error) {
      if (error instanceof ModelFailure) {
        throw new AnswerFailure(error.stage, error.requestStatus);
      }
      throw new AnswerFailure('model-request');
    }
    return atAnswerStage('model-output-validate', () => {
      const groundedFacts = validateGroundedFacts(modelOutput.facts, modelInput.sourceRefs);
      const candidates = validateMemoryCandidates(
        modelOutput.memoryCandidates,
        modelInput.sourceRefs,
        [route.primary, ...route.related]
      );
      const unavailable = budget.documents.filter(
        (document) => document.retrievalStatus && document.retrievalStatus !== 'ok'
      );
      const safetyNotes = [
        ...privacy.notes,
        ...budget.notes,
        ...unavailable.map((document) => `${document.source.id}:${document.retrievalNote ?? '情報源未確認'}`),
        ...groundedFacts.rejected.map((item) => `事実${item.index + 1}を除外:${item.reason}`),
        ...candidates.rejected.map((item) => `保存候補${item.index + 1}を除外:${item.reason}`)
      ];
      if (privacy.blockedSourceIds.length > 0) {
        safetyNotes.push(`L4情報源を除外:${privacy.blockedSourceIds.join(',')}`);
      }

      const attention = privacy.blockedSourceIds.length > 0
        || unavailable.length > 0
        || groundedFacts.rejected.length > 0
        || candidates.rejected.length > 0;

      return {
        requestId: request.requestId,
        route,
        ...modelOutput,
        facts: groundedFacts.accepted,
        memoryCandidates: candidates.accepted,
        conflicts,
        sources: modelInput.sourceRefs,
        safety: {
          level: attention ? 'attention' : 'normal',
          notes: safetyNotes
        }
      };
    });
  }
}

function deduplicateDocuments(documents: SourceDocument[]): SourceDocument[] {
  const byId = new Map<string, SourceDocument>();
  for (const document of documents) {
    const current = byId.get(document.source.id);
    if (!current || document.source.priority < current.source.priority) {
      byId.set(document.source.id, document);
    }
  }
  return [...byId.values()].sort((a, b) => a.source.priority - b.source.priority);
}
