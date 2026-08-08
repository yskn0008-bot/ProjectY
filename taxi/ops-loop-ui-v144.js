(function exposeOpsLoopUi(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YosTaxiOpsLoopUiV144 = api;
  if (root && root.document) {
    const start = () => api.mount(root);
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof globalThis === "undefined" ? this : globalThis, function createOpsLoopUi() {
  "use strict";

  const mounted = new WeakMap();

  function areaCandidates(settings) {
    return [...new Set(String(settings?.areas || "").split("・").map((area) => area.trim()).filter(Boolean))];
  }

  function isOccupied(env) {
    const status = env?.state?.status;
    return Boolean(env?.state?.activeRide) || status === "ride" || status === "occupied";
  }

  function element(document, tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }

  function shown(value, suffix = "") {
    return value === null || value === undefined || value === "" ? "未確認" : `${value}${suffix}`;
  }

  function addRow(document, parent, label, value) {
    const row = element(document, "div", "yos-ops-row");
    row.append(element(document, "span", "yos-ops-muted", label), element(document, "strong", "", value));
    parent.append(row);
  }

  function groupText(group) {
    if (!group || typeof group !== "object") return null;
    const keys = Object.keys(group);
    return keys.length ? keys.map((key) => `${key}: ${shown(group[key]?.rides, "回")} / ${shown(group[key]?.revenue, "円")}`).join("、") : null;
  }

  function renderDetails(env) {
    const document = env?.document;
    const drive = document?.querySelector(".yos131-drive");
    const host = drive?.querySelector(".yos131-header > div:first-child");
    if (!host) return null;

    const core = env.YosTaxiOpsLoopV144;
    const runtime = core?.runtime || {};
    const decision = runtime.currentDecision || {};
    const occupied = isOccupied(env);
    let details = host.querySelector(".yos-ops-loop");
    if (!details) {
      details = element(document, "details", "yos-ops-loop");
      host.append(details);
    }
    details.replaceChildren();
    details.append(element(document, "summary", "yos-ops-summary", "営業判断の根拠"));

    const grid = element(document, "div", "yos-ops-grid");
    addRow(document, grid, "確信度", shown(decision.confidence));
    addRow(document, grid, "見切り時間", shown(decision.cutoffMinutes, "分"));
    addRow(document, grid, "現在area", shown(runtime.areaConfirmed ? runtime.currentArea : null));
    addRow(document, grid, "推奨area", shown(decision.recommendedArea));
    details.append(grid);

    const areas = element(document, "div", "yos-ops-area-list");
    for (const area of areaCandidates(env.settings)) {
      const button = element(document, "button", "yos-ops-area", area);
      button.type = "button";
      button.disabled = occupied;
      if (runtime.areaConfirmed && runtime.currentArea === area) {
        button.dataset.current = "true";
        button.append(element(document, "span", "yos-ops-muted", " 現在"));
      }
      if (decision.recommendedArea === area) {
        button.dataset.recommended = "true";
        button.append(element(document, "span", "yos-ops-muted", " 推奨"));
      }
      button.addEventListener("click", () => {
        if (isOccupied(env)) return;
        runtime.currentArea = area;
        runtime.areaConfirmed = true;
        if (typeof env.render === "function") env.render();
        renderDetails(env);
      });
      areas.append(button);
    }
    details.append(areas);

    const mapArea = decision.recommendedArea || (runtime.areaConfirmed ? runtime.currentArea : null);
    if (mapArea) {
      const link = element(document, "a", "yos-ops-map-link", "Google Mapsで確認");
      link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapArea)}`;
      link.target = "_blank";
      link.rel = "noopener";
      details.append(link);
    }

    const analysis = env.TaxiDecisionLoopV1?.analyzeShift?.(env.state) || {};
    const analysisNode = element(document, "div", "yos-ops-analysis");
    addRow(document, analysisNode, "売上", shown(analysis.revenue, "円"));
    addRow(document, analysisNode, "乗車回数", shown(analysis.rideCount, "回"));
    addRow(document, analysisNode, "平均単価", shown(analysis.averageFare, "円"));
    addRow(document, analysisNode, "営業時給", shown(analysis.hourlyRevenue, "円"));
    addRow(document, analysisNode, "実車率", analysis.utilizationRate == null ? "未確認" : `${Math.round(analysis.utilizationRate * 100)}%`);
    addRow(document, analysisNode, "空車分", shown(analysis.vacantMinutes, "分"));
    const byArea = groupText(analysis.byArea);
    const byDemand = groupText(analysis.byDemandContext);
    if (byArea) addRow(document, analysisNode, "area別", byArea);
    if (byDemand) addRow(document, analysisNode, "需要別", byDemand);
    details.append(analysisNode);
    if (runtime.demandError) details.append(element(document, "p", "yos-ops-muted", "需要情報を確認できません"));
    return details;
  }

  function afterReady(env, callback) {
    if (env.document.readyState === "loading") env.document.addEventListener("DOMContentLoaded", callback, { once: true });
    else callback();
  }

  function refreshAndRender(env, core) {
    return Promise.resolve().then(() => core.refreshDemand(env)).catch(() => null).then(() => {
      afterReady(env, () => {
        if (typeof env.render === "function") env.render();
        renderDetails(env);
      });
    });
  }

  function mount(env = globalThis) {
    if (!env || mounted.has(env) || !env.YosTaxiOpsLoopV144 || !env.document) return false;
    const core = env.YosTaxiOpsLoopV144;
    core.install(env);
    const record = {};
    mounted.set(env, record);
    afterReady(env, () => {
      renderDetails(env);
      const target = env.document.body || env.document.querySelector(".yos131-drive");
      if (target && typeof env.MutationObserver === "function") {
        record.observer = new env.MutationObserver(() => {
          if (!env.document.querySelector(".yos-ops-loop")) renderDetails(env);
        });
        record.observer.observe(target, { childList: true, subtree: true });
      }
    });
    record.visibility = () => {
      if (env.document.visibilityState === "visible") refreshAndRender(env, core);
    };
    env.document.addEventListener("visibilitychange", record.visibility);
    refreshAndRender(env, core);
    return true;
  }

  function unmount(env = globalThis) {
    const record = mounted.get(env);
    if (!record) return false;
    record.observer?.disconnect();
    env.document?.removeEventListener("visibilitychange", record.visibility);
    env.document?.querySelector(".yos-ops-loop")?.remove();
    mounted.delete(env);
    return true;
  }

  return { areaCandidates, isOccupied, renderDetails, mount, unmount };
});
