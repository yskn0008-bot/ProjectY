import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./YOS_DASHBOARD_WIDGET_v1.js", import.meta.url), "utf8");

test("one Scriptable source drives NOW and TODAY dashboard widgets", () => {
  assert.match(source, /args\.widgetParameter/);
  assert.match(source, /"NOW"/);
  assert.match(source, /"TODAY"/);
  assert.match(source, /presentMedium\(\)/);
  assert.match(source, /presentLarge\(\)/);
});

test("reuses the existing private YOS Tasks feed and cache", () => {
  assert.match(source, /https:\/\/project-y-yos-ai\.vercel\.app\/api\/yos\/widget/);
  assert.match(source, /MY_WAY_WIDGET_TOKEN/);
  assert.match(source, /my-way-now-widget-cache-v1\.json/);
  assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(source, /Array\.isArray\(data\.tasks\)/);
  assert.match(source, /data\.task \? \[data\.task\]/);
});

test("reads Calendar and Money locally without creating another SSOT", () => {
  assert.match(source, /CalendarEvent\.today\(\)/);
  assert.match(source, /return \{ok: true, items\}/);
  assert.match(source, /return \{ok: false, items: \[\], error:/);
  assert.match(source, /カレンダーを確認/);
  assert.match(source, /YOS\/Money\/money\.json/);
  assert.match(source, /data\?\.balance\?\.amount/);
  assert.match(source, /value === null \|\| value === undefined/);
  assert.doesNotMatch(source, /writeString\([^\n]*money/i);
});

test("uses larger dashboard typography for iPhone readability", () => {
  assert.match(source, /name\.font = font\(22, "bold"\)/);
  assert.match(source, /font\(prominent \? 25 : 17/);
  assert.match(source, /title\.font = font\(compact \? 14 : 17/);
  assert.match(source, /amount\.font = font\(22, "bold"\)/);
});


test("TODAY task layout keeps full-width wrapped task titles", () => {
  assert.match(source, /const text = parent\.addText\(task\.title/);
  assert.match(source, /text\.lineLimit = 2/);
  assert.match(source, /visibleTasks\.length === 1 && task\.nextAction/);
  assert.match(source, /action\.lineLimit = 2/);
});

test("NOW strips the technical ProjectY prefix before rendering the task title", () => {
  assert.match(source, /function nowDisplayLines\(value\)/);
  assert.match(source, /ProjectY\\s\*\[｜\|\]/);
});

test("NOW splits long titles into two balanced explicit text rows", () => {
  assert.match(source, /if \(title\.length <= 18\) return \[title\]/);
  assert.match(source, /candidates\.push\(\{i, score: longest \+ balance \* 0\.2\}\)/);
  assert.match(source, /return \[\s*title\.slice\(0, split\)\.trim\(\),\s*title\.slice\(split \+ 1\)\.trim\(\),\s*\]/s);
  assert.match(source, /const lines = nowDisplayLines\(task\.title\)/);
  assert.match(source, /const first = parent\.addText\(lines\[0\]/);
  assert.match(source, /const second = parent\.addText\(lines\[1\]\)/);
  assert.match(source, /first\.lineLimit = 1/);
  assert.match(source, /second\.lineLimit = 1/);
});

test("NOW protects long task titles before showing the next action", () => {
  assert.match(source, /const titleNeedsTwoLines = current\.title\.length > 18/);
  assert.match(source, /current\.nextAction && !titleNeedsTwoLines/);
  assert.match(source, /next\.lineLimit = 1/);
});

test("routine controls launch existing Morning and Night shortcuts without inventing completion state", () => {
  assert.match(source, /shortcuts:\/\/run-shortcut\?name=/);
  assert.match(source, /encodeURIComponent\("Morning"\)/);
  assert.match(source, /encodeURIComponent\("Night Brief"\)/);
  assert.match(source, /completion is not inferred/);
});

// Explicit NOW two-row rendering is intentionally covered by source-contract tests.
