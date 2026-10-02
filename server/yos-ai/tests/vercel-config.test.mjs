import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Vercel skips YOS AI builds when server/yos-ai is unchanged', async () => {
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.ignoreCommand,'git diff --quiet HEAD^ HEAD ./');
});
