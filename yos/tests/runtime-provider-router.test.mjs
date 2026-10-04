import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

async function read(path) {
  return readFile(new URL('../../' + path, import.meta.url), 'utf8');
}

test('runtime provider config keeps secondary disabled until parity activation', async () => {
  const config = JSON.parse(await read('data/yos-runtime-providers.json'));
  assert.equal(config.schema_version, '1.0.0');
  const enabled = config.providers.filter((provider) => provider.enabled);
  assert.deepEqual(enabled.map((provider) => provider.id), ['vercel']);
  const secondary = config.providers.find((provider) => provider.id === 'google-cloud-run');
  assert.ok(secondary);
  assert.equal(secondary.base_url, '');
  assert.equal(secondary.enabled, false);
  assert.match(secondary.activation_gate, /parity smoke/i);
});

test('browser router only returns enabled certified HTTPS providers and preserves emergency preview override', async () => {
  const source = await read('yos/runtime-provider-router.js');
  assert.match(source, /provider\?\.enabled/);
  assert.match(source, /provider\.certified_routes\.includes\(name\)/);
  assert.match(source, /url\.protocol !== 'https:'/);
  assert.match(source, /YOS_AI_BASE_URL/);
  assert.match(source, /reportSuccess/);
  assert.match(source, /yos-runtime-providers\.json/);
});

test('YOS Chat and HJ both request provider lists instead of hard-coding one host', async () => {
  const [live, auth, hj, page] = await Promise.all([
    read('yos/desk/live-chat.js'),
    read('yos/hj/yos-auth.js'),
    read('yos/hj/scenes.js'),
    read('yos/desk/index.html')
  ]);
  assert.match(live, /getBaseUrls\('chat'\)/);
  assert.match(auth, /providerBases\('public-config'\)/);
  assert.match(hj, /getBaseUrls\('chat'\)/);
  assert.match(page, /runtime-provider-router\.js/);
});

test('browser client fails over only for provider-style failures and never leaks Vercel preview token', async () => {
  const source = await read('yos/hj/yos-ai-client.js');
  assert.match(source, /baseUrls/);
  assert.match(source, /failoverAllowed/);
  assert.match(source, /429/);
  assert.match(source, /502/);
  assert.match(source, /503/);
  assert.match(source, /504/);
  assert.match(source, /hostname\.endsWith\('\.vercel\.app'\)/);
});
