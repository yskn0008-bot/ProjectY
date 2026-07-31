import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const settings = await readFile(new URL('../docs/NEXT_DEPLOY.md', import.meta.url), 'utf8');

test('next deploy settings match repository configuration', () => {
  assert.match(settings, /Root Directory: server\/yos-ai/u);
  assert.match(settings, /Build command: npm run vercel-build/u);
  assert.match(settings, /Output Directory: public/u);
  assert.match(settings, /Node\.js: 22\.x/u);
  assert.match(settings, /status: ready/u);
});
