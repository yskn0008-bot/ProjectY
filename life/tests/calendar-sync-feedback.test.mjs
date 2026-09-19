import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.doesNotMatch(source, /2026-07-18/, 'calendar dialog must not ship with a stale fixed date');
assert.match(source, /id="syncFeedback"/, 'calendar import must expose an inline result');
assert.match(source, /date!==today\(\)/, 'calendar import must reject payloads for another day');
assert.match(source, /今日の予定だけ取り込めます/, 'date mismatch must explain the failure');
assert.match(source, /取り込み完了：今日の予定/, 'successful manual imports must confirm the count');
assert.match(source, /更新できませんでした：/, 'URL sync failures must be visible in the page');
assert.doesNotMatch(source, /alert\(`取り込みに失敗しました/, 'calendar import errors must not be hidden in an alert');

console.log('Life calendar sync feedback contract: PASS');
