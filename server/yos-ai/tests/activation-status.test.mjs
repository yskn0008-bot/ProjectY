import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const status = await readFile(new URL('../docs/ACTIVATION_STATUS.md', import.meta.url), 'utf8');

test('activation status does not overstate production completion', () => {
  assert.match(status, /Code: ready/u);
  assert.match(status, /not configured/u);
  assert.match(status, /not completed/u);
  assert.match(status, /Code readiness alone is not production completion/u);
});
