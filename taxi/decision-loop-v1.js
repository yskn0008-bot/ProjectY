(function exposeDecisionLoop(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TaxiDecisionLoopV1 = api;
})(typeof globalThis === "undefined" ? this : globalThis, function factory() {
  "use strict";

  const MODES = new Set(["wait", "move", "cruise", "safe"]);
  const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const date = (value) => {
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const confirmedArea = (input) => input &&
    (input.areaConfirmed === true || input.locationConfirmed === true)
    ? text(input.area || input.currentArea) : null;

  function clockMinutes(value) {
    const match = text(value)?.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour < 24 && minute < 60 ? hour * 60 + minute : null;
  }

  function isCurrentWindow(window, now) {
    let start;
    let end;
    if (typeof window === "string") [start, end] = window.split(/\s*[-–—]\s*/);
    else if (window && typeof window === "object") ({ start, end } = window);
    start = clockMinutes(start);
    end = clockMinutes(end);
    if (start === null || end === null || !now) return false;
    const current = now.getHours() * 60 + now.getMinutes();
    return end >= start ? current >= start && current <= end : current >= start || current <= end;
  }

  function matchingDemand(input, area) {
    const demand = input && (input.demandSelection || input.demand);
    const now = date(input && (input.now || Date.now()));
    return demand && demand.confirmed === true && text(demand.confidence)?.toLowerCase() === "high" &&
      area && text(demand.area) === area && isCurrentWindow(demand.window, now) ? demand : null;
  }

  function buildDecision(input = {}) {
    const facts = [];
    const inferences = [];
    const unverified = [];
    const status = text(input.status) || "unknown";
    const area = confirmedArea(input);
    const idleMinutes = number(input.idleMinutes);
    facts.push({ type: "status", value: status });
    for (const [type, value] of [
      ["idleMinutes", idleMinutes], ["revenue", number(input.revenue)],
      ["rideCount", number(input.rideCount)], ["averageFare", number(input.averageFare)],
      ["remainingTarget", number(input.remainingTarget)], ["requiredHourly", number(input.requiredHourly)]
    ]) if (value !== null) facts.push({ type, value });
    if (area) facts.push({ type: "area", value: area });
    else unverified.push("現在エリア");

    if (status.toLowerCase() === "occupied" || input.occupied === true) {
      inferences.push("安全と法令を売上より優先する");
      return { action: "安全な運転を継続する", recommendedArea: null, mode: "safe", cutoffMinutes: null,
        reasons: ["実車中のため操作や経路変更を促さない"], confidence: "high", facts, inferences, unverified };
    }

    const demand = matchingDemand(input, area);
    if (demand) {
      facts.push({ type: "demand", value: { id: text(demand.id), title: text(demand.title), window: demand.window,
        area, demandLevel: text(demand.demandLevel), confidence: "high", sourceCheckedAt: text(demand.sourceCheckedAt) } });
      inferences.push("確認済み需要が現在時刻と確定エリアに一致する");
      return { action: `${area}で需要を確認しながら営業`, recommendedArea: area,
        mode: idleMinutes !== null && idleMinutes >= 15 ? "cruise" : "wait",
        cutoffMinutes: idleMinutes !== null && idleMinutes >= 15 ? 10 : 15,
        reasons: ["confirmed/highの現在需要", idleMinutes === null ? "空車時間は未確認" : `空車${Math.round(idleMinutes)}分`],
        confidence: "high", facts, inferences, unverified };
    }
    unverified.push(input.demandSelection || input.demand ? "需要は確認済みの現在根拠ではない" : "現在需要");
    inferences.push("根拠不足のため特定areaへの移動を断定しない");
    return { action: "安全な場所で状況を確認", recommendedArea: null, mode: "wait", cutoffMinutes: 15,
      reasons: ["推奨先を確定できる根拠が不足"], confidence: "low", facts, inferences, unverified };
  }

  function buildRideContext(input = {}) {
    const result = {}, area = confirmedArea(input), demand = matchingDemand(input, area);
    if (area) result.area = area;
    if (demand) result.demandContext = { id: text(demand.id), title: text(demand.title), window: demand.window,
      area, demandLevel: text(demand.demandLevel), confidence: "high", sourceCheckedAt: text(demand.sourceCheckedAt) };
    const decision = input.decision;
    if (decision && typeof decision === "object") result.decisionContext = {
      action: text(decision.action), recommendedArea: text(decision.recommendedArea), mode: text(decision.mode),
      cutoffMinutes: number(decision.cutoffMinutes), confidence: text(decision.confidence),
      reasons: Array.isArray(decision.reasons) ? decision.reasons.slice() : [],
      facts: Array.isArray(decision.facts) ? decision.facts.slice() : [],
      inferences: Array.isArray(decision.inferences) ? decision.inferences.slice() : [],
      unverified: Array.isArray(decision.unverified) ? decision.unverified.slice() : []
    };
    return result;
  }

  const eventKind = (event) => text(event && (event.type || event.kind || event.event))?.toLowerCase();
  const completed = (event) => ["降車", "dropoff", "ride_complete", "fare"].includes(eventKind(event));
  function addGroup(groups, key, revenue) {
    if (!groups[key]) groups[key] = { rides: 0, revenue: 0 };
    groups[key].rides++;
    groups[key].revenue += revenue;
  }
  function analyzeShift(state = {}) {
    const events = Array.isArray(state) ? state : Array.isArray(state.events) ? state.events : [];
    const rides = events.filter(completed), byHour = {}, byArea = {}, byDemandContext = {}, unverified = [];
    let revenue = 0, vacantMinutes = 0, occupiedMinutes = 0;
    for (const event of rides) {
      const fare = number(event.fare ?? event.amount) ?? 0;
      const tip = number(event.tip) ?? 0;
      const sale = fare + tip;
      const vacant = number(event.waitMs) !== null ? number(event.waitMs) / 60000 : number(event.vacantMinutes ?? event.idleMinutes);
      const occupied = number(event.durationMs) !== null ? number(event.durationMs) / 60000 : number(event.occupiedMinutes ?? event.rideMinutes);
      revenue += sale;
      if (vacant !== null) vacantMinutes += Math.max(vacant, 0);
      if (occupied !== null) occupiedMinutes += Math.max(occupied, 0);
      const at = date(event.at || event.end || event.time || event.timestamp);
      if (at) addGroup(byHour, String(at.getHours()).padStart(2, "0"), sale);
      const area = event.areaConfirmed === false ? null : text(event.area);
      if (area) addGroup(byArea, area, sale);
      const demandKey = text(event.demandContext?.id) || text(event.demandContext?.title);
      if (demandKey) addGroup(byDemandContext, demandKey, sale);
    }
    const start = date(!Array.isArray(state) && (state.shiftStart || state.startedAt || state.startTime));
    const end = date(!Array.isArray(state) && (state.shiftEnd || state.endedAt || state.endTime));
    const operatingHours = start && end && end >= start ? (end - start) / 3600000 : null;
    if (!rides.length) unverified.push("売上・乗車実績");
    if (!operatingHours) unverified.push("営業時間");
    if (!Object.keys(byArea).length) unverified.push("確定area別実績");
    if (!Object.keys(byDemandContext).length) unverified.push("記録済み需要context別実績");
    const tracked = vacantMinutes + occupiedMinutes;
    return { dataAvailable: rides.length > 0, revenue, rideCount: rides.length,
      averageFare: rides.length ? revenue / rides.length : null, operatingHours: operatingHours || null,
      hourlyRevenue: operatingHours ? revenue / operatingHours : null,
      utilizationRate: tracked ? occupiedMinutes / tracked : null, vacantMinutes, occupiedMinutes,
      byHour, byArea, byDemandContext, unverified };
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
    const area = confirmedArea(input);
    return { area, evidence: area && Array.isArray(input.evidence) ? input.evidence.map(text).filter(Boolean) : [],
      confidence: area ? text(input.confidence) || "unverified" : "unverified",
      sourceCheckedAt: area ? text(input.sourceCheckedAt) : null,
      mapQuery: area ? encodeURIComponent(area) : null };
  }

  return { buildDecision, buildRideContext, analyzeShift, buildYosPayload, buildAreaView };
})();
