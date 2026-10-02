import test from 'node:test';
import assert from 'node:assert/strict';
import {selectWidgetFeed} from '../dist/widget/selection.js';

function task(order, state, title, nextAction = '') {
  return {
    order,
    title,
    state,
    owner: '',
    due: null,
    priority: '',
    nextAction,
    completion: '',
    blocker: '',
    evidence: ''
  };
}

test('widget prefers the first active task by execution order', () => {
  const feed = selectWidgetFeed([
    task(3, '実行中', '03｜third'),
    task(1, '次にやる', '01｜next'),
    task(2, '本人操作', '02｜you', 'tap once')
  ], '2026-09-13T00:00:00Z');

  assert.equal(feed.sourceState, 'active');
  assert.equal(feed.task?.title, '02｜you');
  assert.equal(feed.task?.nextAction, 'tap once');
  assert.deepEqual(feed.tasks.map((item) => item.title), ['02｜you', '03｜third', '01｜next']);
});

test('widget falls back to the first next task when nothing is active', () => {
  const feed = selectWidgetFeed([
    task(4, '待ち', '04｜wait'),
    task(2, '次にやる', '02｜next'),
    task(7, '次にやる', '07｜later')
  ], null);

  assert.equal(feed.sourceState, 'next');
  assert.equal(feed.task?.title, '02｜next');
  assert.deepEqual(feed.tasks.map((item) => item.title), ['02｜next', '07｜later']);
});

test('widget caps the dashboard task list at three actionable tasks', () => {
  const feed = selectWidgetFeed([
    task(1, '実行中', '01｜active'),
    task(2, '本人操作', '02｜you'),
    task(3, '次にやる', '03｜next'),
    task(4, '次にやる', '04｜later')
  ], null);

  assert.equal(feed.tasks.length, 3);
  assert.deepEqual(feed.tasks.map((item) => item.title), ['01｜active', '02｜you', '03｜next']);
  assert.equal(feed.task, feed.tasks[0]);
});

test('widget returns an empty state when no actionable task exists', () => {
  const feed = selectWidgetFeed([
    task(1, '待ち', 'wait'),
    task(2, '保留', 'hold'),
    task(3, '完了', 'done')
  ], null);

  assert.equal(feed.sourceState, 'empty');
  assert.equal(feed.task, null);
  assert.deepEqual(feed.tasks, []);
});
