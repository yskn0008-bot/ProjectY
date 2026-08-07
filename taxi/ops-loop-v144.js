(function expose(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YosTaxiOpsLoopV144 = api;
})(typeof globalThis === "undefined" ? this : globalThis, function factory(root) {
  "use strict";

  const runtime = {
    currentArea: null,
    areaConfirmed: false,
    currentDecision: null,
    demandSelection: null,
    demandError: null,
    lastDemandFetchAt: 0,
    installed: false
  };
  const originals = new WeakMap();

  const clean = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
  const withoutMunicipality = (value) => clean(value)?.replace(/[市町村]$/, "") || null;

  function demandAreaMatches(current, eventArea) {
    current = clean(current);
    eventArea = clean(eventArea);
    if (!current || !eventArea) return false;
    if (current === eventArea || eventArea.includes(current)) return true;
    const currentBase = withoutMunicipality(current);
    const eventBase = withoutMunicipality(eventArea);
    return Boolean(currentBase && eventBase && currentBase === eventBase);
  }

  function confirmedAreaFromPlace(place, coords, settings) {
    place = clean(place);
    if (!place || !clean(coords)) return null;
    return String(settings?.areas || "").split("・").map((area) => area.trim()).filter(Boolean)
      .find((area) => place.includes(area)) || null;
  }

  function selectedDemandAdapter(selection, currentArea, data) {
    const event = selection?.event;
    if (selection?.phase !== 0 || event?.confidence !== "confirmed" ||
        !demandAreaMatches(currentArea, event?.area)) return null;
    return {
      id: event.id,
      title: event.title,
      window: selection.window,
      area: currentArea,
      demandLevel: event.demandLevel,
      sourceCheckedAt: event.source?.retrieved_at || data?.retrieved_at,
      confirmed: true,
      confidence: "high"
    };
  }

  function buildDecisionInput(env) {
    const revenue = Number(env.sales()) || 0;
    const rideResult = env.rides();
    const rideCount = Array.isArray(rideResult) ? rideResult.length : Number(rideResult) || 0;
    const hours = Number(env.remainingHours()) || 0;
    const remainingTarget = Math.max(0, (Number(env.settings.targetSales) || 0) - revenue);
    const occupied = env.state.status === "ride" || Boolean(env.state.activeRide);
    const input = {
      now: new Date(),
      status: occupied ? "occupied" : "vacant",
      revenue,
      rideCount,
      averageFare: rideCount ? revenue / rideCount : 0,
      idleMinutes: (Number(env.currentIdleMs()) || 0) / 60000,
      remainingTarget,
      requiredHourly: hours > 0 ? remainingTarget / hours : null
    };
    if (runtime.areaConfirmed && runtime.currentArea) {
      input.area = runtime.currentArea;
      input.areaConfirmed = true;
      const data = runtime.demandSelection?.data;
      const selectDemand = env.YosTaxiDemandHome?.selectDemand;
      let selection = null;
      if (data && typeof selectDemand === "function") {
        try {
          selection = selectDemand(data, new Date()) || null;
        } catch (_error) {
          selection = null;
        }
        if (selection) runtime.demandSelection = { ...selection, data };
      }
      const demand = selection ? selectedDemandAdapter(selection, runtime.currentArea, data) : null;
      if (demand) input.demandSelection = demand;
    }
    return input;
  }

  function remember(env, key) {
    let saved = originals.get(env);
    if (!saved) { saved = {}; originals.set(env, saved); }
    if (!(key in saved)) saved[key] = env[key];
    return saved[key];
  }

  function wrapDecision(env) {
    const original = remember(env, "decision");
    if (env.decision?.__yosOpsV144) return env.decision;
    function wrappedDecision(...args) {
      try {
        const module = env.TaxiDecisionLoopV1 || root?.TaxiDecisionLoopV1;
        if (!module || typeof module.buildDecision !== "function") throw new Error("decision module unavailable");
        const result = module.buildDecision(buildDecisionInput(env));
        runtime.currentDecision = result;
        return [result.action, Array.isArray(result.reasons) ? result.reasons.join(" / ") : ""];
      } catch (_) {
        return original.apply(this, args);
      }
    }
    wrappedDecision.__yosOpsV144 = true;
    env.decision = wrappedDecision;
    return wrappedDecision;
  }

  function wrapAdd(env) {
    const original = remember(env, "add");
    if (env.add?.__yosOpsV144) return env.add;
    function wrappedAdd(type, data) {
      const clone = { ...(data || {}) };
      const module = env.TaxiDecisionLoopV1 || root?.TaxiDecisionLoopV1;
      if (type === "乗車") {
        const confirmed = confirmedAreaFromPlace(clone.pickup, clone.pickupCoords, env.settings);
        if (confirmed) { runtime.currentArea = confirmed; runtime.areaConfirmed = true; }
        const area = confirmed || (runtime.areaConfirmed ? runtime.currentArea : null);
        const demandData = runtime.demandSelection?.data;
        const selectDemand = env.YosTaxiDemandHome?.selectDemand;
        let selection = null;
        if (demandData && typeof selectDemand === "function") {
          try {
            selection = selectDemand(demandData, new Date()) || null;
          } catch (_error) {
            selection = null;
          }
          if (selection) runtime.demandSelection = { ...selection, data: demandData };
        }
        if (module?.buildRideContext) Object.assign(clone, module.buildRideContext({
          area, areaConfirmed: Boolean(area), now: new Date(),
          demandSelection: selection ? selectedDemandAdapter(selection, area, demandData) : null,
          decision: runtime.currentDecision
        }));
      } else if (type === "降車") {
        const active = env.state.activeRide || {};
        for (const key of ["area", "demandContext", "decisionContext"])
          if (clone[key] === undefined && active[key] !== undefined) clone[key] = active[key];
        const dropoffArea = confirmedAreaFromPlace(clone.dropoff, clone.dropoffCoords, env.settings);
        if (dropoffArea && clone.dropoffArea === undefined) clone.dropoffArea = dropoffArea;
        const result = original.call(this, type, clone);
        if (dropoffArea) { runtime.currentArea = dropoffArea; runtime.areaConfirmed = true; }
        return result;
      }
      return original.call(this, type, clone);
    }
    wrappedAdd.__yosOpsV144 = true;
    env.add = wrappedAdd;
    return wrappedAdd;
  }

  function wrapSummary(env) {
    const original = remember(env, "summary");
    if (env.summary?.__yosOpsV144) return env.summary;
    function wrappedSummary(...args) {
      const body = original.apply(this, args);
      const module = env.TaxiDecisionLoopV1 || root?.TaxiDecisionLoopV1;
      const analysis = module.analyzeShift(env.state);
      const unverified = runtime.demandError ? [runtime.demandError] : [];
      const payload = module.buildYosPayload({ analysis, decision: runtime.currentDecision, unverified });
      return `${body}\n\n【YOS構造化データ】\n${JSON.stringify(payload, null, 2)}`;
    }
    wrappedSummary.__yosOpsV144 = true;
    env.summary = wrappedSummary;
    return wrappedSummary;
  }

  async function refreshDemand(env, force = false) {
    const now = Date.now();
    if (!force && runtime.lastDemandFetchAt && now - runtime.lastDemandFetchAt < 300000) return runtime.demandSelection;
    runtime.lastDemandFetchAt = now;
    try {
      const response = await env.fetch("./demand-calendar-v1.json", { cache: "no-store" });
      if (!response.ok) throw new Error("demand response failed");
      const data = await response.json();
      const selector = env.YosTaxiDemandHome?.selectDemand;
      if (typeof selector !== "function") throw new Error("demand selector unavailable");
      const selection = selector(data, new Date());
      runtime.demandSelection = selection ? { ...selection, data } : null;
      runtime.demandError = null;
    } catch (_) {
      runtime.demandSelection = null;
      runtime.demandError = "需要情報を確認できません";
    }
    return runtime.demandSelection;
  }

  function install(env = root) {
    if (runtime.installed) return false;
    wrapDecision(env);
    wrapAdd(env);
    wrapSummary(env);
    runtime.installed = true;
    return true;
  }

  return { runtime, demandAreaMatches, confirmedAreaFromPlace, selectedDemandAdapter,
    buildDecisionInput, wrapDecision, wrapAdd, wrapSummary, refreshDemand, install };
});
