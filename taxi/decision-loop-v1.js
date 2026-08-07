(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TaxiDecisionLoopV1 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  "use strict";

  const MODES = new Set(["wait", "move", "cruise", "safe"]);
  const txt = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
  const num = (value) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  };
  const date = (value) => {
    const result = value instanceof Date ? value : new Date(value);
    return Number.isNaN(result.getTime()) ? null : result;
  };
  const areaOf = (input) =>
    input && (input.areaConfirmed === true || input.locationConfirmed === true)
      ? txt(input.area || input.currentArea)
      : null;
  const minutes = (value) => {
    const match = txt(value)?.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour < 24 && minute < 60 ? hour * 60 + minute : null;
  };
  const nowInWindow = (window, now) => {
    let start;
    let end;
    if (typeof window === "string") [start, end] = window.split(/\s*[-–—]\s*/);
    else if (window && typeof window === "object") ({ start, end } = window);
    start = minutes(start);
    end = minutes(end);
    if (start === null || end === null || !now) return false;
    const current = now.getHours() * 60 + now.getMinutes();
    return end >= start ? current >= start && current <= end : current >= start || current <= end;
  };
  const matchingDemand = (input, area) => {
    const demand = input && (input.demandSelection || input.demand);
    const confidence = txt(demand && demand.confidence);
    const demandArea = txt(demand && demand.area);
    const now = date(input && (input.now || Date.now()));
    return demand && demand.confirmed === true && confidence?.toLowerCase() === "high" &&
      area && demandArea === area && nowInWindow(demand.window, now) ? demand : null;
  };

  function buildDecision(input = {}) {
    const facts = [];
    const inferences = [];
    const unverified = [];
    const status = txt(input.status) || "unknown";
    const area = areaOf(input);
    const idle = num(input.idleMinutes);
    const numericFacts = [
      ["idleMinutes", idle], ["revenue", num(input.revenue)], ["rideCount", num(input.rideCount)],
      ["averageFare", num(input.averageFare)], ["remainingTarget", num(input.remainingTarget)],
      ["requiredHourly", num(input.requiredHourly)]
    ];
    facts.push({ type: "status", value: status });
    numericFacts.forEach(([type, value]) => { if (value !== null) facts.push({ type, value }); });
    if (area) facts.push({ type: "area", value: area });
    else unverified.push("現在エリア");

    if (status.toLowerCase() === "occupied" || input.occupied === true) {
      inferences.push("安全と法令を売上より優先する");
      return { action: "安全な運転を継続する", recommendedArea: null, mode: "safe", cutoffMinutes: null,
        reasons: ["実車中のため操作や経路変更を促さない"], confidence: "high", facts, inferences, unverified };
    }

    const demand = matchingDemand(input, area);
    if (demand) {
      facts.push({ type: "demand", value: { id: txt(demand.id), title: txt(demand.title), window: demand.window,
        area, demandLevel: txt(demand.demandLevel), confidence: "high", sourceCheckedAt: txt(demand.sourceCheckedAt) } });
      inferences.push("確認済み需要が現在時刻と確定エリアに一致する");
      return { action: `${area}で需要を確認しながら営業する`, recommendedArea: area,
        mode: idle !== null && idle >= 15 ? "cruise" : "wait", cutoffMinutes: idle !== null && idle >= 15 ? 10 : 15,
        reasons: ["confirmed/highの需要が現在条件に一致", idle === null ? "空車時間は未確認" : `空車${idle}分`],
        confidence: "high", facts, inferences, unverified };
    }

    unverified.push(input.demandSelection || input.demand
      ? "需要情報はconfirmed/high・現在時刻・確定エリアの一致を確認できない" : "現在利用できる需要情報");
    const canMove = Boolean(area && idle !== null && idle >= 20);
    inferences.push(canMove ? "確定エリアで空車時間が長いため短時間の移動を検討できる" : "根拠不足のため特定エリアへの移動は断定しない");
    return { action: canMove ? "安全な場所で周辺状況を確認して短時間移動する" : "安全な場所で状況を確認する",
      recommendedArea: null, mode: canMove ? "move" : "wait", cutoffMinutes: canMove ? 10 : 15,
      reasons: [canMove ? `空車${idle}分` : "推奨先を確定できる根拠が不足"], confidence: canMove ? "medium" : "low",
      facts, inferences, unverified };
  }

  function buildRideContext(input = {}) {
    const result = {};
    const area = areaOf(input);
    if (area) result.area = area;
    const demand = matchingDemand(input, area);
    if (demand) result.demandContext = { id: txt(demand.id), title: txt(demand.title), window: demand.window,
      area, demandLevel: txt(demand.demandLevel), confidence: "high", sourceCheckedAt: txt(demand.sourceCheckedAt) };
    const decision = input.decision;
    if (decision && typeof decision === "object") result.decisionContext = {
      action: txt(decision.action), recommendedArea: txt(decision.recommendedArea),
      mode: MODES.has(decision.mode) ? decision.mode : null, cutoffMinutes: num(decision.cutoffMinutes),
      confidence: txt(decision.confidence), reasons: Array.isArray(decision.reasons) ? decision.reasons.map(txt).filter(Boolean) : [],
      facts: Array.isArray(decision.facts) ? decision.facts.slice() : [],
      inferences: Array.isArray(decision.inferences) ? decision.inferences.slice() : [],
      unverified: Array.isArray(decision.unverified) ? decision.unverified.slice() : []
    };
    return result;
  }

  function analyzeShift(state) {
    const events = Array.isArray(state) ? state : state && Array.isArray(state.events) ? state.events : [];
    const rides = events.filter((event) => {
      const kind = txt(event && (event.type || event.kind || event.event));
      return kind && ["dropoff", "ride_complete", "fare"].includes(kind.toLowerCase());
    });
    let revenue = 0, vacantMinutes = 0, occupiedMinutes = 0;
    const byHour = {}, byArea = {}, byDemandContext = {};
    const add = (groups, key, fare) => {
      if (!groups[key]) groups[key] = { rides: 0, revenue: 0 };
      groups[key].rides += 1; groups[key].revenue += fare;
    };
    rides.forEach((event) => {
      const fare = num(event.fare ?? event.amount) ?? 0;
      const vacant = num(event.vacantMinutes ?? event.idleMinutes);
      const occupied = num(event.occupiedMinutes ?? event.rideMinutes);
      revenue += fare;
      if (vacant !== null) vacantMinutes += Math.max(0, vacant);
      if (occupied !== null) occupiedMinutes += Math.max(0, occupied);
      const at = date(event.at || event.time || event.timestamp || event.dropoffAt || event.endedAt);
      if (at) add(byHour, String(at.getHours()).padStart(2, "0"), fare);
      const area = event.areaConfirmed === false ? null : txt(event.area);
      if (area) add(byArea, area, fare);
      const demand = event.demandContext;
      const demandKey = demand && typeof demand === "object" ? txt(demand.id) || txt(demand.title) : null;
      if (demandKey) add(byDemandContext, demandKey, fare);
    });
    const started = date(state && !Array.isArray(state) && (state.startedAt || state.startTime));
    const ended = date(state && !Array.isArray(state) && (state.endedAt || state.endTime));
    let operatingHours = started && ended && ended >= started ? (ended - started) / 3600000 : null;
    if (operatingHours === null && occupiedMinutes + vacantMinutes > 0) operatingHours = (occupiedMinutes + vacantMinutes) / 60;
    const unverified = [];
    if (!rides.length) unverified.push("売上・乗車実績データなし");
    if (!operatingHours) unverified.push("営業時間");
    if (!Object.keys(byArea).length) unverified.push("確定エリア別実績");
    if (!Object.keys(byDemandContext).length) unverified.push("記録済み需要context別実績");
    const tracked = occupiedMinutes + vacantMinutes;
    return { dataAvailable: rides.length > 0, revenue, rideCount: rides.length,
      averageFare: rides.length ? revenue / rides.length : null, operatingHours: operatingHours || null,
      hourlyRevenue: operatingHours ? revenue / operatingHours : null,
      utilizationRate: tracked ? occupiedMinutes / tracked : null, vacantMinutes, byHour, byArea, byDemandContext, unverified };
  }

  function buildYosPayload(input = {}) {
    const facts = Array.isArray(input.facts) ? input.facts.slice() : [];
    const inferences = Array.isArray(input.inferences) ? input.inferences.slice() : [];
    const unverified = Array.isArray(input.unverified) ? input.unverified.slice() : [];
    if (input.analysis) facts.push({ type: "shiftAnalysis", value: input.analysis });
    if (input.decision) inferences.push({ type: "decision", value: input.decision });
    if (typeof input.followedDecision === "boolean") facts.push({ type: "followedDecision", value: input.followedDecision });
    else unverified.push("判断に従ったかは記録なし");
    return { recipient: "YOS", facts, inferences, unverified };
  }

  function buildAreaView(input = {}) {
    const area = areaOf(input);
    return { area, evidence: area && Array.isArray(input.evidence) ? input.evidence.map(txt).filter(Boolean) : [],
      confidence: area ? txt(input.confidence) || "unverified" : "unverified",
      sourceCheckedAt: area ? txt(input.sourceCheckedAt) : null, mapQuery: area ? encodeURIComponent(area) : null };
  }

  return { buildDecision, buildRideContext, analyzeShift, buildYosPayload, buildAreaView };
})();
