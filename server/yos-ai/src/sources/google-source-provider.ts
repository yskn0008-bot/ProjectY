import { requiredSourceIds, CORE_SOURCE_IDS } from '../source-policy.js';
import type {
  DomainRoute,
  PrivacyLevel,
  SourceDocument,
  SourceProvider,
  SourceRef,
  YosRequest
} from '../types.js';
import type { GoogleDriveClient } from './google-drive-client.js';
import type { GoogleSheetsClient } from './google-sheets-client.js';

interface BaseRegistryEntry {
  id: string;
  title: string;
  kind: SourceRef['kind'];
  priority: number;
  privacyLevel: PrivacyLevel;
}

export interface DocumentRegistryEntry extends BaseRegistryEntry {
  type: 'document';
  fileId: string;
}

export interface SheetRegistryEntry extends BaseRegistryEntry {
  type: 'sheet';
  spreadsheetId: string;
  ranges: string[];
}

export type SourceRegistryEntry = DocumentRegistryEntry | SheetRegistryEntry;

export interface GoogleSourceProviderOptions {
  accessToken: string;
  registry: SourceRegistryEntry[];
}

export class GoogleSourceProvider implements SourceProvider {
  private readonly registry = new Map<string, SourceRegistryEntry>();

  constructor(
    private readonly drive: GoogleDriveClient,
    private readonly sheets: GoogleSheetsClient,
    private readonly options: GoogleSourceProviderOptions
  ) {
    for (const entry of options.registry) this.registry.set(entry.id, entry);
  }

  async loadCoreSources(): Promise<SourceDocument[]> {
    return await Promise.all(CORE_SOURCE_IDS.map((id) => this.loadOne(id)));
  }

  async loadDomainSources(route: DomainRoute, _request: YosRequest): Promise<SourceDocument[]> {
    const core = new Set<string>(CORE_SOURCE_IDS);
    const ids = requiredSourceIds(route).filter((id) => !core.has(id));
    return await Promise.all(ids.map((id) => this.loadOne(id)));
  }

  private async loadOne(sourceId: string): Promise<SourceDocument> {
    const entry = this.registry.get(sourceId);
    if (!entry) return unavailableDocument(sourceId, 'missing', '情報源の接続設定がない');

    try {
      if (entry.type === 'document') {
        const [metadata, content] = await Promise.all([
          this.drive.getMetadata(entry.fileId, this.options.accessToken),
          this.drive.exportText(entry.fileId, this.options.accessToken)
        ]);
        return {
          source: {
            id: entry.id,
            title: entry.title,
            kind: entry.kind,
            priority: entry.priority,
            ...(metadata.modifiedTime ? { modifiedAt: metadata.modifiedTime } : {}),
            locator: `drive:${metadata.id}`
          },
          content,
          privacyLevel: entry.privacyLevel,
          retrievalStatus: 'ok'
        };
      }

      const result = await this.sheets.batchGet(
        entry.spreadsheetId,
        entry.ranges,
        this.options.accessToken
      );
      return {
        source: {
          id: entry.id,
          title: entry.title,
          kind: entry.kind,
          priority: entry.priority,
          locator: `sheets:${result.spreadsheetId}:${entry.ranges.join(',')}`
        },
        content: JSON.stringify(result.valueRanges),
        privacyLevel: entry.privacyLevel,
        retrievalStatus: 'ok'
      };
    } catch (error) {
      const note = error instanceof Error ? error.message : '情報源取得に失敗';
      return unavailableDocument(sourceId, 'error', note, entry);
    }
  }
}

function unavailableDocument(
  sourceId: string,
  status: 'missing' | 'error',
  note: string,
  entry?: SourceRegistryEntry
): SourceDocument {
  return {
    source: {
      id: sourceId,
      title: entry?.title ?? sourceId,
      kind: entry?.kind ?? 'memory',
      priority: entry?.priority ?? 99
    },
    content: `未確認: ${note}`,
    privacyLevel: entry?.privacyLevel ?? 'L1',
    retrievalStatus: status,
    retrievalNote: note
  };
}
