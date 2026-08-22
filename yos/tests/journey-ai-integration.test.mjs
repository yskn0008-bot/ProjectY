import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, js] = await Promise.all([
  readFile(new URL('../journey.html', import.meta.url), 'utf8'),
  readFile(new URL('../journey.js', import.meta.url), 'utf8')
]);

test('reuses the Hero Journey storage record and saves raw input before network work', () => {
  assert.match(js, /STORAGE_KEY = 'yos-hero-journey-v1'/);
  assert.doesNotMatch(js, /localStorage\.setItem\([^S]/);
  const persist = js.indexOf('if (!save())', js.indexOf('async function sendConversation'));
  const token = js.indexOf('await getToken()', persist);
  const request = js.indexOf('await fetch(', persist);
  assert.ok(persist > -1 && persist < token && token < request);
});

test('uses the existing endpoint and ephemeral credential provider', () => {
  assert.match(js, /YOS_AUTH\?\.getGoogleIdToken/);
  assert.match(js, /new URL\('\/api\/yos\/chat', baseUrl\)/);
  assert.match(js, /Authorization: `Bearer \$\{token\.trim\(\)\}`/);
  assert.doesNotMatch(js, /localStorage\.(?:getItem|setItem)\([^\n]*(?:token|credential|source)/i);
});

test('keeps AI classifications pending until one-at-a-time confirmation', () => {
  for (const field of ['facts', 'assumptions', 'unknowns', 'conflicts', 'nextAction', 'memoryCandidates']) {
    assert.match(js, new RegExp(`result\\?\\.${field}`));
  }
  assert.match(js, /status: 'pending'/);
  assert.match(js, /if \(decision === 'yes'\)/);
  assert.match(js, /else if \(decision === 'unknown'\)/);
  assert.doesNotMatch(js, /confirmedFacts\.push\([^}]*memoryCandidates/s);
  assert.equal((html.match(/data-candidate-decision=/g) || []).length, 3);
});

test('documents required fallback statuses and renders candidate text safely', () => {
  for (const status of [401, 403, 429, 503]) assert.match(js, new RegExp(`${status}:`));
  assert.match(js, /\$\('candidateText'\)\.textContent = candidate\.text/);
  assert.doesNotMatch(js, /candidateText'\)\.innerHTML/);
});
