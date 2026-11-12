import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/intake/screenshot-capture.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace('export function parseScreenshotCapture', 'function parseScreenshotCapture'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}
}).outputText;
const parse = new Function(js + '\nreturn parseScreenshotCapture;')();

const valid = {
  captureId: 'screenshot-12345678',
  capturedAt: '2026-11-12T09:00:00+09:00',
  source: 'ios-screenshot',
  saveLocation: 'photos',
  mimeType: 'image/png',
  imageBase64: 'iVBORw0KGgo='
};

test('accepts each of the three screenshot destinations', () => {
  for (const saveLocation of ['photos', 'files', 'clipboard']) {
    assert.equal(parse({...valid, saveLocation}).ok, true);
  }
});
test('rejects missing identifiers, invalid formats and invalid base64', () => {
  for (const payload of [
    {...valid, captureId: 'short'},
    {...valid, mimeType: 'text/plain'},
    {...valid, imageBase64: 'not base64!'},
    {...valid, source: 'other'},
    {...valid, capturedAt: 'invalid'}
  ]) assert.equal(parse(payload).ok, false);
});
test('rejects oversized images', () => {
  assert.equal(parse({...valid, imageBase64: 'AAAA'.repeat(1_666_668)}).ok, false);
});
