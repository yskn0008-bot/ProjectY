export type YosDomain =
  | 'yos'
  | 'taxi-pre'
  | 'taxi-live'
  | 'taxi-post'
  | 'taxi-research'
  | 'life'
  | 'money'
  | 'idea'
  | 'system'
  | 'translation'
  | 'navigation'
  | 'external';

export type EvidenceStatus =
  | 'confirmed'
  | 'candidate'
  | 'hypothesis'
  | 'temporary'
  | 'rejected'
  | 'superseded'
  | 'unknown';

export type PrivacyLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export interface SourceRef {
  id: string;
  title: string;
  kind: 'law' | 'master' | 'change-log' | 'code' | 'sheet' | 'original' | 'web' | 'memory';
  priority: number;
  modifiedAt?: string;
  locator?: string;
}

export interface EvidenceItem {
  key: string;
  value: string | number | boolean | null;
  status: EvidenceStatus;
  source: SourceRef;
  note?: string;
}

export interface SourceDocument {
  source: SourceRef;
  content: string;
  privacyLevel: PrivacyLevel;
  evidence?: EvidenceItem[];
}

export interface DomainRoute {
  primary: YosDomain;
  related: YosDomain[];
  liveMode: boolean;
  reasons: string[];
}

export interface Conflict {
  key: string;
  selected: EvidenceItem;
  alternatives: EvidenceItem[];
  reason: string;
}

export interface MemoryCandidate {
  content: string;
  category: 'personal-data' | 'hypothesis' | 'operation-rule' | 'spec-change' | 'implementation-change';
  domain: YosDomain;
  status: 'candidate';
  evidenceSourceIds: string[];
  privacyLevel: PrivacyLevel;
}

export interface YosRequest {
  requestId: string;
  userText: string;
  currentTime: string;
  currentLocation?: string;
  conversationSummary?: string;
}

export interface ModelInput {
  requestId: string;
  route: DomainRoute;
  instruction: string;
  userText: string;
  context: string;
  sourceRefs: SourceRef[];
  conflicts: Conflict[];
}

export interface ModelOutput {
  answer: string;
  facts: string[];
  assumptions: string[];
  unknowns: string[];
  memoryCandidates: MemoryCandidate[];
  nextAction: string | null;
}

export interface YosAnswer extends ModelOutput {
  requestId: string;
  route: DomainRoute;
  conflicts: Conflict[];
  sources: SourceRef[];
  safety: {
    level: 'normal' | 'attention' | 'blocked';
    notes: string[];
  };
}

export interface SourceProvider {
  loadCoreSources(): Promise<SourceDocument[]>;
  loadDomainSources(route: DomainRoute, request: YosRequest): Promise<SourceDocument[]>;
}

export interface ModelClient {
  generate(input: ModelInput): Promise<ModelOutput>;
}
