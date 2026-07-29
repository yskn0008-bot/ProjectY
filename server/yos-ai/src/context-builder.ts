import type { Conflict, DomainRoute, SourceDocument } from './types.js';

export function buildContext(route: DomainRoute, documents: SourceDocument[], conflicts: Conflict[]): string {
  const sourceBlocks = documents.map((document) => {
    const meta = [
      `source_id=${document.source.id}`,
      `title=${document.source.title}`,
      `kind=${document.source.kind}`,
      `priority=${document.source.priority}`,
      document.source.modifiedAt ? `modified_at=${document.source.modifiedAt}` : null,
      document.source.locator ? `locator=${document.source.locator}` : null,
      `privacy=${document.privacyLevel}`
    ].filter(Boolean).join(' | ');

    return `--- SOURCE START ---\n${meta}\n${document.content}\n--- SOURCE END ---`;
  });

  const conflictBlocks = conflicts.map((conflict) => {
    const alternatives = conflict.alternatives
      .map((item) => `${item.source.id}=${String(item.value)}(${item.status})`)
      .join(', ');
    return `${conflict.key}: selected=${conflict.selected.source.id}:${String(conflict.selected.value)}; alternatives=${alternatives}`;
  });

  return [
    `PRIMARY_DOMAIN=${route.primary}`,
    `RELATED_DOMAINS=${route.related.join(',') || 'none'}`,
    `LIVE_MODE=${String(route.liveMode)}`,
    '',
    'CONFLICTS',
    conflictBlocks.join('\n') || 'none',
    '',
    'SOURCES',
    sourceBlocks.join('\n\n')
  ].join('\n');
}
