import type { SourceDocument } from './types.js';

export interface ContextBudgetOptions {
  maxTotalCharacters?: number;
  maxDocumentCharacters?: number;
}

export interface ContextBudgetResult {
  documents: SourceDocument[];
  notes: string[];
  usedCharacters: number;
}

export function applyContextBudget(
  documents: SourceDocument[],
  options: ContextBudgetOptions = {}
): ContextBudgetResult {
  const maxTotalCharacters = options.maxTotalCharacters ?? 100_000;
  const maxDocumentCharacters = options.maxDocumentCharacters ?? 30_000;
  assertPositiveSafeInteger(maxTotalCharacters, 'maxTotalCharacters');
  assertPositiveSafeInteger(maxDocumentCharacters, 'maxDocumentCharacters');

  let remaining = maxTotalCharacters;
  let usedCharacters = 0;
  const notes: string[] = [];
  const output: SourceDocument[] = [];

  for (const document of documents) {
    const allowance = Math.min(maxDocumentCharacters, remaining);
    if (allowance <= 0) {
      notes.push(`${document.source.id}:コンテキスト総量上限により本文を省略`);
      output.push({ ...document, content: '' });
      continue;
    }

    if (document.content.length <= allowance) {
      output.push(document);
      remaining -= document.content.length;
      usedCharacters += document.content.length;
      continue;
    }

    const fullMarker = `\n[CONTEXT_TRUNCATED source_id=${document.source.id}]`;
    const marker = fullMarker.slice(0, allowance);
    const visibleLength = Math.max(0, allowance - marker.length);
    const content = `${document.content.slice(0, visibleLength)}${marker}`;
    output.push({ ...document, content });
    remaining -= content.length;
    usedCharacters += content.length;
    notes.push(`${document.source.id}:本文を${document.content.length}文字から${content.length}文字へ制限`);
  }

  return { documents: output, notes, usedCharacters };
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`);
}
