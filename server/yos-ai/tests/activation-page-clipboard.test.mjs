import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../public/activate.html', import.meta.url), 'utf8');

test('copy buttons start disabled until a token exists', () => {
  assert.match(html, /id="copy-token"[^>]*disabled/u);
  assert.match(html, /id="copy-hash"[^>]*disabled/u);
  assert.match(html, /copyToken\.disabled=false/u);
  assert.match(html, /copyHash\.disabled=false/u);
});
