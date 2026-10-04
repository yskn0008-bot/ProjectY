import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Vercel evaluates only the current commit so data-only sync commits do not retrigger old YOS AI changes', async () => {
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.doesNotMatch(config.ignoreCommand,/VERCEL_GIT_PREVIOUS_SHA/);
  assert.match(config.ignoreCommand,/git diff --quiet HEAD\^ HEAD \.\//);
  assert.match(config.ignoreCommand,/git rev-parse HEAD\^/);
});

test('Vercel does not cancel an active YOS AI build when a later data-sync commit arrives', async () => {
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.github?.autoJobCancelation,false);
});
