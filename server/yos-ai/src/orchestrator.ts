import { buildContext } from './context-builder.js';
import { detectConflicts } from './conflict-detector.js';
import { routeDomain } from './domain-router.js';
import { sanitizeDocuments } from './privacy-filter.js';
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
  'あなたは西村陽介専用AI YOSの判断エンジンである。',
  '安全、法令、信頼できる事実、長期的期待値、再現性、効率、本人の意思の順で判断する。',
  '資料が支持しない内容を補わない。',
  '確定、仮説、未確認、矛盾を分ける。',
  '重要な断定にはsource_idを対応付ける。',
  '正本やデータを変更せず、必要なら保存候補だけを返す。',
  '営業中モードでは結論を短くする。'
].join('\n');

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
    private readonly modelClient: ModelClient
  ) {}

  async answer(request: YosRequest): Promise<YosAnswer> {
    assertRequest(request);

    const route = routeDomain(request.userText);
    const [core, domain] = await Promise.all([
      this.sourceProvider.loadCoreSources(),
      this.sourceProvider.loadDomainSources(route, request)
    ]);

    const allDocuments = deduplicateDocuments([...core, ...domain]);
    const privacy = sanitizeDocuments(allDocuments);
    const conflicts = detectConflicts(collectEvidence(privacy.documents));
    const context = buildContext(route, privacy.documents, conflicts);

    const modelInput: ModelInput = {
      requestId: request.requestId,
      route,
      instruction: BASE_INSTRUCTION,
      userText: request.userText,
      context,
      sourceRefs: privacy.documents.map((document) => document.source),
      conflicts
    };

    const modelOutput = await this.modelClient.generate(modelInput);
    const safetyNotes = [...privacy.notes];
    if (privacy.blockedSourceIds.length > 0) {
      safetyNotes.push(`L4情報源を除外:${privacy.blockedSourceIds.join(',')}`);
    }

    return {
      requestId: request.requestId,
      route,
      ...modelOutput,
      conflicts,
      sources: modelInput.sourceRefs,
      safety: {
        level: privacy.blockedSourceIds.length > 0 ? 'attention' : 'normal',
        notes: safetyNotes
      }
    };
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
