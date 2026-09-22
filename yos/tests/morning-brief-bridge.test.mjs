import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const [bridge,shared]=await Promise.all([
 readFile(new URL('../morning-brief-bridge-v1.js',import.meta.url),'utf8'),
 readFile(new URL('../shared-state-v1.js',import.meta.url),'utf8')
]);
test('Morning Brief bridge reuses existing SSOTs and creates no storage',()=>{
 assert.match(bridge,/yos-life-v1/);
 assert.match(bridge,/yos-shared-state-v1/);
 assert.match(bridge,/yos-task-dashboard-cache-v1/);
 assert.doesNotMatch(bridge,/localStorage\.setItem|indexedDB|sessionStorage/);
 assert.match(bridge,/shortcuts:\/\/run-shortcut/);
 assert.match(bridge,/YOS_MORNING_BRIDGE_V1/);
});
test('Money shared projection exposes computed daily amount and future payments',()=>{
 assert.match(shared,/dailyText/);
 assert.match(shared,/upcomingPayments/);
 assert.match(shared,/outgoingUntilAnchor/);
});
test('bridge excludes calendar and weather to avoid duplicating existing Morning Brief inputs',()=>{
 assert.doesNotMatch(bridge,/CalendarEvent|weather|UV|schedule/);
});