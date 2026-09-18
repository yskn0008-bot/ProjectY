import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./MY_WAY_5_WIDGETS_v1.js", import.meta.url), "utf8");

test("keeps one Scriptable source for the five approved widget parameters", () => {
  for (const value of ["HOME", "LIFE", "MONEY", "HJ", "IDEA"]) {
    assert.match(source, new RegExp(`\\b${value}\\b`));
  }
  assert.match(source, /args\.widgetParameter/);
});

test("HOME reuses the existing private widget feed and Keychain token", () => {
  assert.match(source, /https:\/\/project-y-yos-ai\.vercel\.app\/api\/yos\/widget/);
  assert.match(source, /MY_WAY_WIDGET_TOKEN/);
  assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(source, /Keychain\.get\(CONFIG\.keychainKey\)/);
});

test("feed is loaded only for HOME while the four small widgets stay navigation-only", () => {
  assert.match(source, /key === "HOME" \? await loadHomeFeed\(\) : null/);
  assert.match(source, /key === "HOME" \? makeHome\(homeResult\) : makeSmall\(\)/);
});

test("preserves direct destinations for all five MY WAY areas", () => {
  assert.match(source, /\/ProjectY\/yos\/"/);
  assert.match(source, /\/ProjectY\/life\/"/);
  assert.match(source, /#money"/);
  assert.match(source, /#journey"/);
  assert.match(source, /#idea"/);
});
