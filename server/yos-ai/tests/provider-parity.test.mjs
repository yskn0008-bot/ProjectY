import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ROUTES} from '../cloud-run/server.mjs';

const root = new URL('../', import.meta.url);
const providers = JSON.parse(await readFile(new URL('providers.json', root), 'utf8'));
const publicProviders = JSON.parse(await readFile(new URL('../../data/yos-runtime-providers.json', root), 'utf8'));

test('provider quality contract forbids lower-quality failover', () => {
  assert.equal(providers.schema_version, '1.0.0');
  for (const [key, value] of Object.entries(providers.quality_contract)) {
    assert.equal(value, true, `quality contract must remain true: ${key}`);
  }
});

test('Cloud Run reuses the same YOS route modules for every certified route', () => {
  const cloudRun = providers.providers.find((provider) => provider.id === 'google-cloud-run');
  assert.ok(cloudRun);
  assert.equal(cloudRun.status, 'candidate');
  assert.equal(cloudRun.auth_mode, 'application_default');

  const pathByRoute = {
    chat: '/api/yos/chat',
    health: '/api/yos/health',
    'public-config': '/api/yos/public-config',
    'nav-model': '/api/yos/nav-model',
    'taxi-event': '/api/yos/taxi-event',
    'taxi-health': '/api/yos/taxi-health',
    tasks: '/api/yos/tasks',
    'tasks-health': '/api/yos/tasks-health',
    intake: '/api/yos/intake',
    'projecty-decision': '/api/yos/projecty-decision'
  };

  for (const route of cloudRun.certified_routes) {
    assert.ok(pathByRoute[route], `unknown certified route: ${route}`);
    assert.ok(ROUTES.has(pathByRoute[route]), `Cloud Run route missing: ${route}`);
  }
  assert.equal(ROUTES.has('/api/yos/widget'), false);
  assert.equal(ROUTES.has('/api/yos/slack-events'), false);
  assert.deepEqual(cloudRun.not_certified_routes, ['widget', 'slack-events']);
});

test('secondary provider stays disabled until live parity smoke explicitly activates it', () => {
  const secondary = publicProviders.providers.find((provider) => provider.id === 'google-cloud-run');
  assert.ok(secondary);
  assert.equal(secondary.enabled, false);
  assert.equal(secondary.base_url, '');
  assert.match(secondary.activation_gate, /parity smoke/i);
});

test('production Vercel remains the first enabled provider during migration', () => {
  const enabled = publicProviders.providers.filter((provider) => provider.enabled);
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].id, 'vercel');
  assert.equal(enabled[0].base_url, 'https://project-y-yos-ai.vercel.app');
});
