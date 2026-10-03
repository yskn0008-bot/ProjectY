import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./YOS_DASHBOARD_UPDATE.js", import.meta.url), "utf8");

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
