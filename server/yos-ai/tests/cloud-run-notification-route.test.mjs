import test from 'node:test';
import assert from 'node:assert/strict';
import {ROUTES} from '../cloud-run/server.mjs';
import {readFileSync} from 'node:fs';

test('existing Cloud Run gateway exposes notification under the existing intake handler',()=>{
  assert.ok(ROUTES.has('/api/yos/notification'));
  assert.equal(ROUTES.get('/api/yos/notification'),ROUTES.get('/api/yos/intake'));
  const code=readFileSync(new URL('../cloud-run/server.mjs',import.meta.url),'utf8');
  assert.match(code,/target\.searchParams\.set\('mode', 'notification'\)/);
});

test('YOS history UI uses enabled certified Cloud Run provider, not Vercel fallback',()=>{
  const source=readFileSync(new URL('../../../yos/notification-history.html',import.meta.url),'utf8');
  assert.match(source,/x\.id==='google-cloud-run'/);
  assert.match(source,/x\.enabled===true/);
  assert.match(source,/x\.certified_routes\.includes\('notification'\)/);
  assert.doesNotMatch(source,/project-y-yos-ai\.vercel\.app/);
  assert.match(source,/window\.YOS_AI_BASE_URL=parsed\.origin/);
});
