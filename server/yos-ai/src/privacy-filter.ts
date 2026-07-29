import type { PrivacyLevel, SourceDocument } from './types.js';

const secretPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: 'OpenAI API key', pattern: /sk-[A-Za-z0-9_-]{16,}/gu },
  { name: 'Google private key block', pattern: /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/gu },
  { name: 'Bearer token', pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/giu },
  { name: 'generic secret assignment', pattern: /\b(?:api[_-]?key|secret|password|private[_-]?key)\s*[:=]\s*[^\s,;]+/giu }
];

export interface PrivacyResult {
  content: string;
  blocked: boolean;
  notes: string[];
}

export function sanitizeText(content: string, privacyLevel: PrivacyLevel): PrivacyResult {
  if (privacyLevel === 'L4') {
    return { content: '', blocked: true, notes: ['L4秘密情報はモデルへ送信しない'] };
  }

  let sanitized = content;
  const notes: string[] = [];

  for (const item of secretPatterns) {
    const next = sanitized.replace(item.pattern, `[REDACTED:${item.name}]`);
    if (next !== sanitized) notes.push(`${item.name}を除外`);
    sanitized = next;
  }

  return { content: sanitized, blocked: false, notes };
}

export function sanitizeDocuments(documents: SourceDocument[]): {
  documents: SourceDocument[];
  blockedSourceIds: string[];
  notes: string[];
} {
  const output: SourceDocument[] = [];
  const blockedSourceIds: string[] = [];
  const notes: string[] = [];

  for (const document of documents) {
    const result = sanitizeText(document.content, document.privacyLevel);
    notes.push(...result.notes.map((note) => `${document.source.id}:${note}`));
    if (result.blocked) {
      blockedSourceIds.push(document.source.id);
      continue;
    }
    output.push({ ...document, content: result.content });
  }

  return { documents: output, blockedSourceIds, notes };
}
