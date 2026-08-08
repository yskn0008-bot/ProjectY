import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { buildDecision, buildRideContext, analyzeShift, buildYosPayload, buildAreaView } = require("../decision-loop-v1.js");
const demand = { id: "event-a", title: "確認済みイベント", window: "10:00-12:00", area: "那覇",
  demandLevel: "high", confidence: "high", confirmed: true, sourceCheckedAt: "2026-08-07T08:00:00Z" };

test("occupied安全", () => {
  const result = buildDecision({ status: "occupied", area: "那覇", areaConfirmed: true, now: "2026-08-07T10:30:00", demand });
  assert.equal(result.mode, "safe"); assert.equal(result.recommendedArea, null); assert.match(result.action, /安全/);
});

test("confirmed/high一致", () => {
  const result = buildDecision({ status: "vacant", area: "那覇", areaConfirmed: true, idleMinutes: 18,
    now: "2026-08-07T10:30:00", demandSelection: demand });
  assert.equal(result.recommendedArea, "那覇"); assert.equal(result.confidence, "high");
});

test("provisional/unverified非断定", () => {
  for (const confidence of ["provisional", "unverified"]) {
    const result = buildDecision({ area: "那覇", areaConfirmed: true, now: "2026-08-07T10:30:00",
      demand: { ...demand, confirmed: false, confidence } });
    assert.equal(result.recommendedArea, null); assert.equal(result.confidence, "low");
  }
});

test("area不明", () => {
  const result = buildDecision({ currentArea: "那覇", now: "2026-08-07T10:30:00", demand });
  assert.equal(result.recommendedArea, null); assert.ok(result.unverified.includes("現在エリア"));
  assert.equal(buildAreaView({ area: "那覇" }).area, null);
});

test("日本語降車はfare+tipを売上にする", () => {
  const result = analyzeShift({ events: [{ type: "降車", fare: 1200, tip: 300, at: "2026-08-07T10:00:00Z" }] });
  assert.equal(result.revenue, 1500); assert.equal(result.rideCount, 1); assert.equal(result.averageFare, 1500);
});

test("waitMs/durationMsをmsから分へ換算", () => {
  const result = analyzeShift({ events: [{ type: "降車", fare: 1000, waitMs: 600000, durationMs: 1200000 }] });
  assert.equal(result.vacantMinutes, 10); assert.equal(result.utilizationRate, 2 / 3);
});

test("shiftStart/shiftEndを営業時間にする", () => {
  const result = analyzeShift({ shiftStart: "2026-08-07T09:00:00Z", shiftEnd: "2026-08-07T13:00:00Z",
    events: [{ type: "降車", fare: 4000 }] });
  assert.equal(result.operatingHours, 4); assert.equal(result.hourlyRevenue, 1000);
});

test("legacy英語eventと分単位フィールドに互換", () => {
  const result = analyzeShift([{ type: "dropoff", fare: 1000, tip: 100, idleMinutes: 5, rideMinutes: 15 },
    { kind: "fare", amount: 900 }, null]);
  assert.equal(result.revenue, 2000); assert.equal(result.rideCount, 2); assert.equal(result.vacantMinutes, 5);
});

test("demandContext無し過去データを補完しない", () => {
  const result = analyzeShift({ events: [{ type: "降車", fare: 1000 }] });
  assert.deepEqual(result.byDemandContext, {}); assert.deepEqual(result.byArea, {});
  assert.ok(result.unverified.some((value) => value.includes("需要context")));
});

test("facts/inferences/unverifiedを分離", () => {
  const payload = buildYosPayload({ facts: ["事実"], inferences: ["推測"], unverified: ["未確認"] });
  assert.equal(payload.recipient, "YOS"); assert.deepEqual(payload.facts, ["事実"]); assert.deepEqual(payload.inferences, ["推測"]);
  assert.ok(payload.unverified.includes("判断に従ったかは記録なし"));
  const context = buildRideContext({ area: "那覇", areaConfirmed: true, now: "2026-08-07T10:30:00", demand,
    decision: buildDecision({ status: "occupied" }) });
  assert.ok(Array.isArray(context.decisionContext.facts)); assert.ok(Array.isArray(context.decisionContext.inferences));
});

test("保存APIと仮スコアを持たない", async () => {
  const source = await readFile(new URL("../decision-loop-v1.js", import.meta.url), "utf8");
  for (const pattern of [/localStorage/i, /sessionStorage/i, /setItem\s*\(/i, /removeItem\s*\(/i, /\.clear\s*\(/i,
    /yos-taxi-ops-v1/i, /yos-taxi-settings-v2/i, /migration/i, /delete/i]) assert.equal(pattern.test(source), false, String(pattern));
  const view = buildAreaView({ area: "那覇", areaConfirmed: true, evidence: ["公式確認"], confidence: "high" });
  assert.deepEqual(Object.keys(view), ["area", "evidence", "confidence", "sourceCheckedAt", "mapQuery"]);
  for (const key of ["score", "rank", "expectedValue", "colorRank"]) assert.equal(key in view, false);
  const numericValues = Object.values(view).filter((value) => typeof value === "number");
  for (const value of [82, 71, 55, 24]) assert.equal(numericValues.includes(value), false);
});
