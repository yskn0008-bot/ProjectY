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
});

test('widget falls back to the first next task when nothing is active', () => {
  const feed = selectWidgetFeed([
    task(4, '待ち', '04｜wait'),
    task(2, '次にやる', '02｜next'),
    task(7, '次にやる', '07｜later')
  ], null);

  assert.equal(feed.sourceState, 'next');
  assert.equal(feed.task?.title, '02｜next');
});

test('widget returns an empty state when no actionable task exists', () => {
  const feed = selectWidgetFeed([
    task(1, '待ち', 'wait'),
    task(2, '保留', 'hold'),
    task(3, '完了', 'done')
  ], null);

  assert.equal(feed.sourceState, 'empty');
  assert.equal(feed.task, null);
});
