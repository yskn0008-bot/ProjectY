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

test("updater targets YOS Dashboard v2 and verifies both source and saved contents", () => {
  assert.match(source, /YOS Dashboard v2\.js/);
  assert.match(source, /const text = parent\.addText\(task\.title/);
  assert.match(source, /const titleNeedsTwoLines = current\.title\.length > 18/);
  assert.match(source, /manager\.readString\(path\)/);
  assert.match(source, /saved !== source/);
});

test("updater never accepts the retired horizontal task-dot renderer", () => {
  assert.match(source, /const dot = row\.addStack\(\)/);
  assert.match(source, /旧タスク表示コードを検出/);
});
