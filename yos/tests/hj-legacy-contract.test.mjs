import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('legacy Journey storage keys remain stable', async () => {
  const source = await read('journey.js');

  assert.match(source, /const STORAGE_KEY = 'yos-hero-journey-v1';/);
  assert.match(source, /const HOME_KEY = 'yos-home-settings-v2';/);
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\)/);
  assert.doesNotMatch(source, /localStorage\.removeItem\(STORAGE_KEY\)/);
  assert.doesNotMatch(source, /localStorage\.clear\(\)/);
});

test('legacy factual records and timestamps stay in the durable state', async () => {
  const source = await read('journey.js');

  for (const field of ['quests', 'completed', 'reflections']) {
    assert.match(source, new RegExp(`${field}: \\[\\]`));
  }
  assert.match(source, /createdAt: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /quest\.completedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(source, /savedAt: new Date\(\)\.toISOString\(\)/);
});

test('YOS service worker precaches every Journey entry asset', async () => {
  const [worker, page] = await Promise.all([
    read('service-worker.js'),
    read('journey.html')
  ]);

  for (const asset of ['./journey.html', './journey.css', './journey.js']) {
    assert.ok(worker.includes(`'${asset}'`), `${asset} must remain in the YOS cache manifest`);
  }
  assert.match(page, /href="\.\/journey\.css"/);
  assert.match(page, /src="\.\/journey\.js"/);
});

test('YOS home retains a single Journey entry', async () => {
  const home = await read('index.html');
  const entries = home.match(/class="domain-card journey" href="\.\/hj\/"/g) || [];

  assert.equal(entries.length, 1);
  assert.match(home, />Hero's Journey</);
  assert.equal((home.match(/href="\.\/journey\.html"/g) || []).length, 0);
});

