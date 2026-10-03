import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Vercel compares YOS AI changes from the last successful deployment', async () => {
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.match(config.ignoreCommand,/VERCEL_GIT_PREVIOUS_SHA/);
  assert.match(config.ignoreCommand,/git diff --quiet/);
  assert.match(config.ignoreCommand,/HEAD \.\//);
  assert.match(config.ignoreCommand,/HEAD\^ HEAD \.\//);
});
