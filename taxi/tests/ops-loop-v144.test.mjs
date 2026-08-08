import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ops = require("../ops-loop-v144.js");

function resetRuntime() {
  Object.assign(ops.runtime, {
    currentArea: null,
    areaConfirmed: false,
    currentDecision: null,
    demandSelection: null,
    demandError: null,
    lastDemandFetchAt: 0,
    installed: false
  });
}

function decisionModule(overrides = {}) {
  return {
    buildDecision(input) {
      return input.status === "occupied"
        ? { action: "安全運行", reasons: ["操作しない"], mode: "safe" }
        : { action: "待機", reasons: ["確認中"], facts: [], inferences: [], unverified: [] };
    },
    buildRideContext(input) {
      return {
        ...(input.area ? { area: input.area } : {}),
        ...(input.demandSelection ? { demandContext: input.demandSelection } : {}),
        ...(input.decision ? { decisionContext: input.decision } : {})
      };
    },
    analyzeShift() {
      return { revenue: 1000, rideCount: 1, unverified: [] };
    },
    buildYosPayload(input) {
      return {
        recipient: "YOS",
        facts: [input.analysis],
        inferences: input.decision ? [input.decision] : [],
        unverified: input.unverified || []
      };
    },
    ...overrides
  };
}

function makeEnv(overrides = {}) {
  return {
    state: { status: "available", activeRide: null, events: [] },
    settings: { targetSales: 20000, areas: "那覇・浦添" },
    sales: () => 5000,
    rides: () => [{}, {}],
    currentIdleMs: () => 600000,
    remainingHours: () => 5,
    decision: () => ["既存判断", "既存根拠"],
    add() {},
    summary: () => "既存summary本文",
    TaxiDecisionLoopV1: decisionModule(),
    ...overrides
  };
}

const confirmedEvent = {
  id: "d1",
  title: "祭り",
  area: "那覇市",
  confidence: "confirmed",
  demandLevel: "high",
  source: { retrieved_at: "2026-08-07T00:00:00Z" }
};

test("area一致はexact・event.includes(current)・市町村suffixを扱い無関係を拒否する", () => {
  assert.equal(ops.demandAreaMatches("那覇", "那覇"), true);
  assert.equal(ops.demandAreaMatches("那覇", "沖縄県那覇市"), true);
  assert.equal(ops.demandAreaMatches("浦添市", "浦添町"), true);
  assert.equal(ops.demandAreaMatches("那覇", "沖縄県北部"), false);
});

test("coordsと明示placeが両方ある場合だけareaを自動確定する", () => {
  const settings = { areas: "那覇・浦添" };
  assert.equal(ops.confirmedAreaFromPlace("那覇市久茂地", "26.2,127.6", settings), "那覇");
  assert.equal(ops.confirmedAreaFromPlace("那覇市久茂地", "", settings), null);
  assert.equal(ops.confirmedAreaFromPlace("久茂地", "26.2,127.6", settings), null);
});

test("phase0 confirmedかつarea一致だけadapterをhighにする", () => {
  const adapted = ops.selectedDemandAdapter({ phase: 0, event: confirmedEvent, window: "10:00-12:00" }, "那覇", {});
  assert.equal(adapted.confidence, "high");
  assert.equal(adapted.confirmed, true);
  assert.equal(adapted.area, "那覇");
});

test("provisional・phase1・area不一致はadapterでnullになる", () => {
  assert.equal(ops.selectedDemandAdapter({ phase: 0, event: { ...confirmedEvent, confidence: "provisional" } }, "那覇", {}), null);
  assert.equal(ops.selectedDemandAdapter({ phase: 1, event: confirmedEvent }, "那覇", {}), null);
  assert.equal(ops.selectedDemandAdapter({ phase: 0, event: confirmedEvent }, "浦添", {}), null);
});

test("buildDecisionInputがsales/rides/idle/remaining/requiredを計算する", () => {
  resetRuntime();
  const input = ops.buildDecisionInput(makeEnv());
  assert.deepEqual({
    revenue: input.revenue,
    rideCount: input.rideCount,
    averageFare: input.averageFare,
    idleMinutes: input.idleMinutes,
    remainingTarget: input.remainingTarget,
    requiredHourly: input.requiredHourly
  }, { revenue: 5000, rideCount: 2, averageFare: 2500, idleMinutes: 10, remainingTarget: 15000, requiredHourly: 3000 });
});

test("occupiedではmoduleのsafe結果が既存decisionより優先される", () => {
  resetRuntime();
  const env = makeEnv({ state: { status: "ride", activeRide: {}, events: [] } });
  ops.wrapDecision(env);
  assert.deepEqual(env.decision(), ["安全運行", "操作しない"]);
  assert.equal(ops.runtime.currentDecision.mode, "safe");
});

test("module例外の時だけoriginal decisionへfallbackする", () => {
  resetRuntime();
  const env = makeEnv({ TaxiDecisionLoopV1: decisionModule({ buildDecision() { throw new Error("fail"); } }) });
  ops.wrapDecision(env);
  assert.deepEqual(env.decision(), ["既存判断", "既存根拠"]);
});

test("乗車addは元を1回だけ呼びinputと旧eventsを破壊せずoptional contextを付ける", () => {
  resetRuntime();
  const oldEvent = { type: "降車", fare: 900 };
  let calls = 0;
  let received;
  const env = makeEnv({
    state: { status: "available", activeRide: null, events: [oldEvent] },
    add(type, data) { calls += 1; received = { type, data }; }
  });
  ops.runtime.currentDecision = { action: "待機" };
  const input = { pickup: "那覇市久茂地", pickupCoords: "26,127" };
  ops.wrapAdd(env);
  env.add("乗車", input);
  assert.equal(calls, 1);
  assert.equal(received.data.area, "那覇");
  assert.equal(received.data.decisionContext.action, "待機");
  assert.deepEqual(input, { pickup: "那覇市久茂地", pickupCoords: "26,127" });
  assert.deepEqual(oldEvent, { type: "降車", fare: 900 });
});

test("降車はactiveRide contextをcopyしdata既存値を優先してdropoffAreaを付け元addを1回呼ぶ", () => {
  resetRuntime();
  let calls = 0;
  let received;
  const activeRide = { area: "那覇", demandContext: { id: "d1" }, decisionContext: { action: "待機" } };
  const env = makeEnv({
    state: { status: "ride", activeRide, events: [] },
    add(_type, data) { calls += 1; received = data; }
  });
  ops.wrapAdd(env);
  env.add("降車", { area: "既存", dropoff: "浦添市港川", dropoffCoords: "26,127" });
  assert.equal(calls, 1);
  assert.equal(received.area, "既存");
  assert.deepEqual(received.demandContext, { id: "d1" });
  assert.deepEqual(received.decisionContext, { action: "待機" });
  assert.equal(received.dropoffArea, "浦添");
});

test("summaryは元本文を完全保持してrecipient YOSと3区分を追加する", () => {
  resetRuntime();
  const env = makeEnv();
  ops.wrapSummary(env);
  const output = env.summary();
  assert.ok(output.startsWith("既存summary本文\n\n【YOS構造化データ】\n"));
  const payload = JSON.parse(output.split("【YOS構造化データ】\n")[1]);
  assert.equal(payload.recipient, "YOS");
  assert.ok(Array.isArray(payload.facts));
  assert.ok(Array.isArray(payload.inferences));
  assert.ok(Array.isArray(payload.unverified));
});

test("refreshDemandは5分gate内の2回目fetchを行わない", async () => {
  resetRuntime();
  let calls = 0;
  const env = makeEnv({
    fetch: async () => { calls += 1; return { ok: true, json: async () => ({ retrieved_at: "now" }) }; },
    YosTaxiDemandHome: { selectDemand: () => ({ phase: 1, event: {} }) }
  });
  await ops.refreshDemand(env);
  await ops.refreshDemand(env);
  assert.equal(calls, 1);
});

test("fetch失敗は古いdemandSelectionをnull化してthrowしない", async () => {
  resetRuntime();
  ops.runtime.demandSelection = { phase: 0, event: confirmedEvent, data: {} };
  const env = makeEnv({ fetch: async () => { throw new Error("offline"); } });
  await assert.doesNotReject(ops.refreshDemand(env));
  assert.equal(ops.runtime.demandSelection, null);
  assert.equal(ops.runtime.demandError, "需要情報を確認できません");
});

test("cached需要は毎回再計算しphase1を除外、phase0 confirmedを採用する", () => {
  resetRuntime();
  ops.runtime.currentArea = "那覇";
  ops.runtime.areaConfirmed = true;
  ops.runtime.demandSelection = { phase: 0, event: confirmedEvent, data: { events: [] } };
  let phase = 1;
  const env = makeEnv({ YosTaxiDemandHome: { selectDemand: () => ({ phase, event: confirmedEvent, window: "10:00-12:00" }) } });
  assert.equal("demandSelection" in ops.buildDecisionInput(env), false);
  phase = 0;
  assert.equal(ops.buildDecisionInput(env).demandSelection.confidence, "high");
});

test("installは二重化せずsourceにDOM・保存・移行・仮評価語を含まない", async () => {
  resetRuntime();
  const env = makeEnv();
  assert.equal(ops.install(env), true);
  const installed = [env.decision, env.add, env.summary];
  assert.equal(ops.install(env), false);
  assert.deepEqual([env.decision, env.add, env.summary], installed);
  const source = await readFile(new URL("../ops-loop-v144.js", import.meta.url), "utf8");
  for (const pattern of [
    /document|MutationObserver|visibilitychange/,
    /localStorage|sessionStorage|setItem|removeItem|\.clear\s*\(/,
    /yos-taxi-ops-v1|yos-taxi-settings-v2|migration|\bdelete\b/i,
    /\b82\b|\b71\b|\b55\b|\b24\b|\bscore\b|\brank\b|expectedValue|colorRank/i
  ]) assert.equal(pattern.test(source), false, String(pattern));
});
