import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
const listeners = {};
const deleted = [];
let claimed = false;

const context = {
  URL,
  Response,
  Headers,
  TextEncoder,
  TextDecoder,
  fetch: async () => new Response('<!doctype html><body></body>', { headers: { 'content-type': 'text/html' } }),
  caches: {
    keys: async () => [
      'yos-life-home-v2',
      'yos-life-home-v4',
      'yos-life-home-v5',
      'yos-life-home-v6-daily-flow',
      'yos-taxi-v138',
      'yos-nav-v106',
      'yos-home-v1',
      'shared-yos-life-backup',
      'unrelated-cache'
    ],
    delete: async key => {
      deleted.push(key);
      return true;
    },
    open: async () => ({ addAll: async () => {}, put: async () => {} }),
    match: async () => null
  },
  self: {
    location: { origin: 'https://example.test' },
    clients: { claim: async () => { claimed = true; } },
    skipWaiting: async () => {},
    addEventListener: (type, handler) => { listeners[type] = handler; }
  }
};

vm.runInNewContext(source, context, { filename: 'life/service-worker.js' });
assert.equal(typeof listeners.activate, 'function', 'activate listener must be registered');

let activation;
listeners.activate({ waitUntil: promise => { activation = Promise.resolve(promise); } });
await activation;

assert.deepEqual(deleted, ['yos-life-home-v2','yos-life-home-v4','yos-life-home-v5'], 'only stale Life caches may be deleted');
assert.equal(claimed, true, 'Life service worker must claim its clients after cleanup');
assert.match(source, /key\.startsWith\(LIFE_CACHE_PREFIX\)/, 'cleanup must be restricted by Life cache prefix');
assert.match(source, /home-priority-v1\.css\?v=2/, 'priority home styles must be available offline');
assert.match(source, /home-v1\.js\?v=3/, 'current home script must be cached with its requested URL');
assert.doesNotMatch(source, /keys\.filter\(key=>key!==CACHE\)/, 'global cache deletion pattern must not return');

console.log('Life service worker cache scope: PASS');
