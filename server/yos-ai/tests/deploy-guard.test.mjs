import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const guard = await readFile(new URL('../docs/DEPLOY_GUARD.md', import.meta.url), 'utf8');

test('deploy guard prohibits blind retries', () => {
  assert.match(guard, /Do not press Deploy repeatedly/u);
  assert.match(guard, /Deploy once/u);
  assert.match(guard, /last error line/u);
});
