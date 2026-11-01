import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./YOS_DASHBOARD_UPDATE.js", import.meta.url), "utf8");
const widgetSource = fs.readFileSync(new URL("./YOS_DASHBOARD_WIDGET_v1.js", import.meta.url), "utf8");

test("updater resolves main SHA before downloading immutable widget source", () => {
  assert.match(source, /\/branches\/main/);
  assert.match(source, /branch\?\.commit\?\.sha/);
  assert.match(source, /raw\.githubusercontent\.com/);
  assert.match(source, /sha \+/);
});

test("updater targets YOS Dashboard v2 and verifies stable dashboard capabilities", () => {
  assert.match(source, /YOS Dashboard v2\.js/);
  assert.match(source, /source\.length < 5000/);
  assert.match(source, /\/\/ YOS Dashboard Widget v1/);
  assert.match(source, /args\.widgetParameter/);
  assert.match(source, /function makeNow\(/);
  assert.match(source, /function makeToday\(/);
  assert.match(source, /loadTaskFeed\(\)/);
  assert.match(source, /CalendarEvent\.today\(\)/);
  assert.match(source, /YOS\/Money\/money\.json/);
  assert.match(source, /shortcuts:\/\/run-shortcut\?name=/);
  assert.match(source, /manager\.readString\(path\)/);
  assert.match(source, /saved !== source/);
});

test("updater validation does not depend on a specific task-rendering implementation", () => {
  assert.doesNotMatch(source, /const text = parent\.addText\(task\.title/);
  assert.doesNotMatch(source, /const dot = row\.addStack\(\)/);
  assert.doesNotMatch(source, /titleNeedsTwoLines/);
});

test("dashboard updater never removes the installed direct Notion health bridge", () => {
  assert.match(source, /YOS_HEALTH_LOCAL_BRIDGE_V1/);
  assert.match(source, /validateSource\(source\)/);
  assert.match(source, /for \(const marker of required\)/);
});

test("official Dashboard includes the existing verified iPhone health sync exactly once", () => {
  assert.equal((widgetSource.match(/YOS_HEALTH_LOCAL_BRIDGE_V1/g) || []).length, 1);
  assert.match(widgetSource, /const YOS_HEALTH_EXISTING_INBOX_ID/);
  assert.match(widgetSource, /const YOS_HEALTH_EXISTING_DIARY_ID/);
  assert.match(widgetSource, /const YOS_HEALTH_TOKEN_KEY/);
  assert.match(widgetSource, /function yosHealthClassify\(/);
  assert.match(widgetSource, /function yosHealthExtract\(/);
  assert.match(widgetSource, /function yosHealthMerge\(/);
  assert.match(widgetSource, /async function yosHealthRunOnce\(/);
  assert.equal((widgetSource.match(/try \{ await yosHealthRunOnce\(\); \} catch \(_\) \{\}/g)||[]).length, 2);
  assert.equal((widgetSource.match(/Script\.complete\(\);/g)||[]).length, 3);
  assert.match(widgetSource, /Script\.setWidget\(widget\)/);
  assert.match(widgetSource, /function makeToday\(/);
  assert.match(widgetSource, /function makeNow\(/);
});

test("health sync uses only existing Notion resources and never persists unverified claims", () => {
  assert.match(widgetSource, /'YOS_NOTION_INTEGRATION_TOKEN'/);
  assert.match(widgetSource, /'health:'\+day/);
  assert.match(widgetSource, /Clarity報告ID:/);
  assert.match(widgetSource, /readback mismatch/);
  assert.match(widgetSource, /health journal duplicate/);
  assert.match(widgetSource, /Keychain\.contains\(YOS_HEALTH_TOKEN_KEY\)/);
  assert.doesNotMatch(widgetSource, /\bScriptable\.open\(/);
});
