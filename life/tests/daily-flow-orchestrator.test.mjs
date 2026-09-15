import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read = (name) => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('Night Reset rolls unfinished tasks forward without overwriting tomorrow', async () => {
  const source = await read('daily-flow-orchestrator-v1.js');
  const window = {};
  vm.runInNewContext(source, { window, Date, Intl });
  const api = window.__yosDailyFlowOrchestratorV1Api;
  assert.equal(typeof api?.prepareNextDay, 'function');

  const data = {
    days: {
      '2026-09-13': {
        tasks: [
          { text: '未完了A', done: false, category: 'personal' },
          { text: '完了B', done: true, category: 'personal' },
          { text: '未完了C', done: false, category: 'personal' }
        ],
        lifeFlow: {}
      },
      '2026-09-14': {
        tasks: [
          { text: '先にある予定', done: false, category: 'personal' },
          { text: '未完了C', done: false, category: 'personal' }
        ],
        lifeFlow: {}
      }
    }
  };

  const summary = api.prepareNextDay(
    data,
    '2026-09-13',
    '明日の重要予定',
    '2026-09-13T22:00:00.000Z'
  );

  assert.deepEqual(
    data.days['2026-09-14'].tasks.map(task => task.text),
    ['先にある予定', '未完了C', '未完了A'],
    'existing tomorrow tasks stay first, duplicate unfinished tasks are not copied twice'
  );
  assert.equal(summary.remainingCount, 2);
  assert.equal(summary.carriedCount, 1);
  assert.equal(summary.firstStep, '先にある予定');
  assert.equal(data.days['2026-09-14'].tasks[2].carriedFrom, '2026-09-13');
  assert.equal(data.days['2026-09-13'].lifeFlow.nightReset.nextDate, '2026-09-14');
  assert.equal(data.days['2026-09-14'].lifeFlow.preparedFromNight.sourceDate, '2026-09-13');
  assert.equal(data.days['2026-09-14'].lifeFlow.preparedFromNight.important, '明日の重要予定');
});

test('the orchestrator extends the existing Life store and is loaded by the current suite', async () => {
  const [source, loader] = await Promise.all([
    read('daily-flow-orchestrator-v1.js'),
    read('yos-suite-v3.js')
  ]);
  assert.match(source, /const DATA_KEY='yos-life-v1'/);
  assert.match(source, /preparedFromNight/);
  assert.match(source, /nightReset/);
  assert.match(source, /carriedFrom/);
  assert.match(source, /capture:true/);
  assert.doesNotMatch(source, /localStorage\.clear\(/);
  assert.doesNotMatch(source, /yos-life-daily-flow|yos-night-reset/);
  assert.match(loader, /daily-flow-orchestrator-v1\.js\?v=1/);
});
