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


test('notification Google sign-in resolves public config only through certified Cloud Run',()=>{
  const history=readFileSync(new URL('../../../yos/notification-history.html',import.meta.url),'utf8');
  const auth=readFileSync(new URL('../../../yos/hj/yos-auth.js',import.meta.url),'utf8');
  assert.match(history,/window\.YOS_AUTH_PUBLIC_CONFIG_BASE_URL=parsed\.origin\+'\/'/);
  assert.match(history,/parsed\.hostname\.endsWith\('\.run\.app'\)/);
  assert.match(auth,/route === 'public-config'/);
  assert.match(auth,/globalThis\.YOS_AUTH_PUBLIC_CONFIG_BASE_URL/);
  assert.match(auth,/return \[explicit\.origin\]/);
  assert.match(auth,/throw new Error\('Explicit notification authentication endpoint is invalid'\)/);
});
