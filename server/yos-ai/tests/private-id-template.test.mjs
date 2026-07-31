import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const template = await readFile(new URL('../docs/KNOWN_RESOURCE_IDS.template', import.meta.url), 'utf8');

test('private resource template contains no committed values', () => {
  for (const line of template.split(/\r?\n/u)) {
    if (!line || line.startsWith('#')) continue;
    assert.match(line, /^[A-Z0-9_]+=$/u);
  }
});
