import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, '../api/yos/tasks-health.mjs');
const source = readFileSync(sourcePath, 'utf8');

test('tasks health probe has valid JavaScript syntax', () => {
  const result = spawnSync(process.execPath, ['--check', sourcePath], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('tasks health probe is production-only and reports fixed stages', () => {
  assert.match(source, /VERCEL_ENV/u);
  assert.match(source, /!== 'production'/u);
  for (const stage of ['config', 'accessToken', 'driveFind', 'sheetsRead', 'header']) {
    assert.match(source, new RegExp(`${stage}: 'pending'`, 'u'));
  }
});

test('tasks health probe classifies Drive failures into fixed non-secret categories', () => {
  for (const category of ['api_disabled', 'scope_denied', 'ambiguous', 'bad_request', 'unauthorized', 'forbidden', 'rate_limited', 'upstream_error']) {
    assert.match(source, new RegExp(`return '${category}'`, 'u'));
  }
  assert.match(source, /stages\.driveFind = classifyDriveFailure\(error\)/u);
});

test('tasks health probe does not expose credentials, task data, ids, or raw errors', () => {
  assert.doesNotMatch(source, /error\.stack|JSON\.stringify\(error\)|stages\.[A-Za-z]+\s*=\s*text/u);
  assert.doesNotMatch(source, /serviceAccountEmail|projectNumber|poolId|providerId/u);
  assert.doesNotMatch(source, /rowCount|taskCount|generatedAt|title:|nextAction:|completion:|blocker:|evidence:/u);
  assert.match(source, /\{status: status === 200 \? 'ready' : 'blocked', stages\}/u);
});

test('tasks health probe is read-only and non-cacheable', () => {
  assert.doesNotMatch(source, /POST|PATCH|PUT|DELETE/u);
  assert.match(source, /Cache-Control': 'no-store'/u);
  assert.match(source, /X-Robots-Tag': 'noindex'/u);
});
