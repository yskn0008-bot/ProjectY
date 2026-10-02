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

test("routine controls launch existing Morning and Night shortcuts without inventing completion state", () => {
  assert.match(source, /shortcuts:\/\/run-shortcut\?name=/);
  assert.match(source, /encodeURIComponent\("Morning"\)/);
  assert.match(source, /encodeURIComponent\("Night Brief"\)/);
  assert.match(source, /completion is not inferred/);
});
