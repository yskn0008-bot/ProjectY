// YOS Departure Guard v0.2 — Mother decision-readiness experiment
// Event-driven, local-only, shadow-first departure preparation for Scriptable on iPhone.
// Reuses YOS Battery Widget's local data and iOS Calendar data.
// The user still owns the decision. This prototype never invokes Clarity automatically.
//
// Optional Shortcut parameter:
//   "leaving"  -> run when AirPods connect / user is likely leaving
//   "morning"  -> run from Morning Flow
//   { source: "leaving" | "morning" }
//
// Optional event notes:
//   持: 保険証, 診察券
//   出発: 45        // minutes before event start (override default)

const CONFIG = {
  version: "0.2",
  experimentId: "calendar-decision-readiness-v0",
  defaultMode: "shadow",
  lookAheadHours: 6,
  preparationWindowMinutes: 60,
  defaultDepartureLeadMinutes: 45,
  notifyWhenDepartureWithinMinutes: 20,
  carryReminderWithinMinutes: 60,
  batteryCheckWithinMinutes: 60,
  battery: {
    iphone: 40,
    airpods: 30,
    case: 20,
  },
  airpodsStaleMinutes: 90,
  duplicateSuppressMinutes: 25,
  batteryDataFile: "YOS-Battery-Widget-v1.json",
  stateFile: "YOS-Departure-Guard-v0.json",
  eventStoreFile: "YOS-Departure-Guard-EventStore-v0.json",
  maxEventRecords: 200,
}

const fm = FileManager.local()
const batteryPath = fm.joinPath(fm.documentsDirectory(), CONFIG.batteryDataFile)
const statePath = fm.joinPath(fm.documentsDirectory(), CONFIG.stateFile)
const eventStorePath = fm.joinPath(fm.documentsDirectory(), CONFIG.eventStoreFile)
const now = new Date()
const invocation = parseInvocation(args.shortcutParameter, args.queryParameters)
const source = invocation.source

await main()

async function main() {
  const nextEvent = await findNextEvent(now)
  const battery = readBatterySnapshot()
  const decision = decide({ now, source, nextEvent, battery })
  const decisionPack = decision.shouldNotify || decision.reasons.includes("departure_window")
    ? buildDecisionPack({ nextEvent, battery, decision })
    : null
  const gate = evaluatePresentationGate(decision)
  const baselineWouldNotify = fixedRuleWouldNotify(decision)
  const duplicate = decisionPack ? isDuplicate(decisionPack.fingerprint) : false

  // Shadow Mode is the default: prepare + log, but never interrupt.
  const notified = invocation.mode === "active" && gate.level === "active" && !!decisionPack && !duplicate
  if (notified) {
    await sendNotification(decision)
    rememberNotification(decisionPack.fingerprint)
  }

  const eventStoreSaved = appendEventRecord({
    schema_version: "0.2",
    event_type: "decision_opportunity_evaluated",
    experiment_id: CONFIG.experimentId,
    observed_at: now.toISOString(),
    source,
    mode: invocation.mode,
    trigger_event_id: decisionPack ? decisionPack.trigger_event_id : null,
    candidate_id: decisionPack ? decisionPack.candidate_id : null,
    event_start_at: nextEvent ? nextEvent.startDate.toISOString() : null,
    has_location: !!(nextEvent && String(nextEvent.location || "").trim()),
    minutes_to_departure: decision.minutesToDeparture,
    reasons: decision.reasons,
    presentation_level: gate.level,
    gate_reasons: gate.reasons,
    baseline_would_notify: baselineWouldNotify,
    decision_pack_prepared: !!decisionPack,
    notified,
    duplicate,
    user_decision: null,
    execution_result: null,
  })

  if (config.runsInApp) {
    await showAcceptanceSummary({ nextEvent, decision, decisionPack, gate, eventStoreSaved, notified })
  }

  Script.setShortcutOutput({
    ok: true,
    version: CONFIG.version,
    experimentId: CONFIG.experimentId,
    source,
    mode: invocation.mode,
    shadow: invocation.mode === "shadow",
    baselineWouldNotify,
    gate,
    notified,
    duplicate,
    eventStoreSaved,
    decisionPack,
  })
  Script.complete()
}

async function findNextEvent(fromDate) {
  const end = new Date(fromDate.getTime() + CONFIG.lookAheadHours * 60 * 60 * 1000)
  const events = await CalendarEvent.between(fromDate, end)
  return events
    .filter(e => !e.isAllDay && e.startDate && e.startDate.getTime() >= fromDate.getTime())
    .sort((a, b) => a.startDate - b.startDate)[0] || null
}

function readBatterySnapshot() {
  const snapshot = {
    iphone: {
      level: clamp(Math.round(Device.batteryLevel() * 100), 0, 100),
      charging: Device.isCharging() || Device.isFullyCharged(),
      updatedAt: Date.now(),
      stale: false,
    },
    airpods: { level: null, charging: false, updatedAt: 0, stale: true },
    case: { level: null, charging: false, updatedAt: 0, stale: true },
  }

  if (!fm.fileExists(batteryPath)) return snapshot

  try {
    const raw = JSON.parse(fm.readString(batteryPath))
    for (const kind of ["airpods", "case"]) {
      const src = raw && raw.devices ? raw.devices[kind] : null
      if (!src || src.level == null) continue
      snapshot[kind] = {
        level: clamp(Math.round(Number(src.level)), 0, 100),
        charging: !!src.charging,
        updatedAt: Number(src.updatedAt || 0),
        stale: !src.updatedAt || (Date.now() - Number(src.updatedAt)) > CONFIG.airpodsStaleMinutes * 60 * 1000,
      }
    }
  } catch (_) {
    // Battery data is optional. A malformed/stale file never blocks departure checking.
  }
  return snapshot
}

function decide({ now, source, nextEvent, battery }) {
  const leavingSignal = ["leaving", "airpods", "departure"].includes(source)
  const reasons = []
  const warningLines = []
  let departureAt = null
  let departureLeadMinutes = CONFIG.defaultDepartureLeadMinutes
  let minutesToDeparture = null
  let carryItems = []

  if (nextEvent) {
    const meta = parseEventNotes(nextEvent.notes || "")
    departureLeadMinutes = meta.departureLeadMinutes || CONFIG.defaultDepartureLeadMinutes
    carryItems = meta.carryItems
    departureAt = new Date(nextEvent.startDate.getTime() - departureLeadMinutes * 60 * 1000)
    minutesToDeparture = Math.ceil((departureAt.getTime() - now.getTime()) / 60000)

    if (minutesToDeparture <= 0) {
      reasons.push("departure_due")
      warningLines.push(`出発目安を${Math.abs(minutesToDeparture)}分${minutesToDeparture === 0 ? "" : "超過"}`)
    } else if (minutesToDeparture <= CONFIG.notifyWhenDepartureWithinMinutes) {
      reasons.push("departure_soon")
      warningLines.push(`出発まであと${minutesToDeparture}分`)
    } else if (minutesToDeparture <= CONFIG.preparationWindowMinutes) {
      reasons.push("departure_window")
    }

    if (carryItems.length && (leavingSignal || minutesToDeparture <= CONFIG.carryReminderWithinMinutes)) {
      reasons.push("carry_items")
      warningLines.push(`持ち物: ${carryItems.join("・")}`)
    }
  }

  const batteryRelevant = leavingSignal || (nextEvent && minutesToDeparture <= CONFIG.batteryCheckWithinMinutes)
  if (batteryRelevant) {
    addBatteryWarning("iPhone", battery.iphone, CONFIG.battery.iphone, "iphone_low", reasons, warningLines)
    addBatteryWarning("AirPods", battery.airpods, CONFIG.battery.airpods, "airpods_low", reasons, warningLines)
    addBatteryWarning("ケース", battery.case, CONFIG.battery.case, "case_low", reasons, warningLines)

    if (leavingSignal && (battery.airpods.level == null || battery.airpods.stale)) {
      reasons.push("airpods_stale")
      warningLines.push("AirPods残量: 同期待ち")
    }
    if (leavingSignal && (battery.case.level == null || battery.case.stale)) {
      reasons.push("case_stale")
      warningLines.push("ケース残量: 同期待ち")
    }
  }

  // No event + no concrete battery problem => stay completely silent.
  const shouldNotify = reasons.length > 0
  const fingerprint = makeFingerprint(nextEvent, reasons)

  return {
    shouldNotify,
    duplicate: shouldNotify ? isDuplicate(fingerprint) : false,
    reasons,
    warningLines,
    fingerprint,
    nextEvent,
    departureAt,
    departureLeadMinutes,
    minutesToDeparture,
    carryItems,
  }
}

function buildDecisionPack({ nextEvent, battery, decision }) {
  const eventSeed = nextEvent
    ? `${nextEvent.identifier || nextEvent.title}|${nextEvent.startDate.getTime()}`
    : `no-event|${source}`
  const triggerEventId = `evt_${stableHash(eventSeed)}`
  const candidateId = `cand_${stableHash(`${triggerEventId}|${[...decision.reasons].sort().join(",")}`)}`
  const expiresAt = nextEvent
    ? nextEvent.startDate.toISOString()
    : new Date(now.getTime() + 30 * 60 * 1000).toISOString()

  const options = []
  if (nextEvent && decision.minutesToDeparture != null && decision.minutesToDeparture <= CONFIG.notifyWhenDepartureWithinMinutes) {
    options.push({
      id: "leave_now",
      label: "今出る",
      reversible: true,
      action_contract: {
        schema_version: "0.1",
        action: "departure.leave_now",
        status: "proposed",
        approved_by_user: false,
        candidate_id: candidateId,
        payload: {
          event_start_at: nextEvent.startDate.toISOString(),
          destination: String(nextEvent.location || "").trim() || null,
        },
      },
    })
  }

  if (nextEvent && String(nextEvent.location || "").trim()) {
    options.push({
      id: "open_navigation",
      label: "ナビを開く",
      reversible: true,
      action_contract: {
        schema_version: "0.1",
        action: "navigation.start",
        status: "proposed",
        approved_by_user: false,
        candidate_id: candidateId,
        payload: { destination: String(nextEvent.location).trim() },
      },
    })
  }

  options.push({
    id: "do_nothing",
    label: "何もしない",
    reversible: true,
    action_contract: null,
  })

  const evidence = []
  if (nextEvent) {
    evidence.push({
      type: "calendar.event",
      observed_at: now.toISOString(),
      start_at: nextEvent.startDate.toISOString(),
      has_location: !!String(nextEvent.location || "").trim(),
      departure_lead_minutes: decision.departureLeadMinutes,
    })
  }
  evidence.push({
    type: "device.battery",
    observed_at: now.toISOString(),
    iphone_level: battery.iphone.level,
    airpods_known: battery.airpods.level != null && !battery.airpods.stale,
    case_known: battery.case.level != null && !battery.case.stale,
  })

  return {
    schema_version: "0.2",
    experiment_id: CONFIG.experimentId,
    candidate_id: candidateId,
    trigger_event_id: triggerEventId,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    decision_deadline: decision.departureAt ? decision.departureAt.toISOString() : null,
    evidence,
    reasons: [...new Set(decision.reasons)],
    confidence: confidenceFor(decision),
    status: invocation.mode === "shadow" ? "shadow" : "prepared",
    user_decision: null,
    execution_result: null,
    reversible: true,
    options,
    fingerprint: decision.fingerprint,
  }
}

function evaluatePresentationGate(decision) {
  if (!decision.reasons.length) return { level: "silent", reasons: ["no_decision_opportunity"] }
  if (decision.reasons.includes("departure_due") || decision.reasons.includes("departure_soon")) {
    return { level: "active", reasons: ["time_sensitive_departure"] }
  }
  if (["leaving", "airpods", "departure"].includes(source) &&
      decision.reasons.some(r => ["iphone_low", "airpods_low", "case_low"].includes(r))) {
    return { level: "active", reasons: ["low_battery_while_leaving"] }
  }
  if (decision.reasons.includes("carry_items") && decision.minutesToDeparture != null &&
      decision.minutesToDeparture <= CONFIG.carryReminderWithinMinutes) {
    return { level: "active", reasons: ["declared_carry_items_near_departure"] }
  }
  return { level: "passive", reasons: ["prepare_without_interrupting"] }
}

function fixedRuleWouldNotify(decision) {
  return decision.reasons.includes("departure_due") || decision.reasons.includes("departure_soon")
}

function confidenceFor(decision) {
  if (decision.reasons.includes("departure_due") || decision.reasons.includes("departure_soon")) return "high"
  if (decision.nextEvent) return "medium"
  return "low"
}

function appendEventRecord(record) {
  try {
    let store = { schema_version: "0.2", experiment_id: CONFIG.experimentId, events: [] }
    if (fm.fileExists(eventStorePath)) {
      const existing = JSON.parse(fm.readString(eventStorePath))
      if (existing && Array.isArray(existing.events)) store = existing
    }
    store.schema_version = "0.2"
    store.experiment_id = CONFIG.experimentId
    store.updated_at = new Date().toISOString()
    store.events = [...store.events, record].slice(-CONFIG.maxEventRecords)
    fm.writeString(eventStorePath, JSON.stringify(store, null, 2))
    if (!fm.fileExists(eventStorePath)) return false
    const saved = JSON.parse(fm.readString(eventStorePath))
    return Array.isArray(saved.events) && saved.events.length > 0
  } catch (_) {
    // Experiment logging must never block departure preparation.
    return false
  }
}

async function showAcceptanceSummary({ nextEvent, decision, decisionPack, gate, eventStoreSaved, notified }) {
  const alert = new Alert()
  alert.title = "Mother出発実験"
  const lines = [
    `Shadow Mode: ${invocation.mode === "shadow" ? "OK" : "OFF"}`,
    `Event Store: ${eventStoreSaved ? "保存OK" : "保存NG"}`,
    `通知: ${notified ? "実行" : "なし"}`,
    `Gate: ${gate.level}`,
  ]
  if (nextEvent) {
    lines.push(`予定取得: OK（${formatTime(nextEvent.startDate)}）`)
    lines.push(`Decision Pack: ${decisionPack ? "作成" : "今回は不要"}`)
    if (decision.minutesToDeparture != null) lines.push(`出発目安まで: ${decision.minutesToDeparture}分`)
  } else {
    lines.push("予定取得: OK（6時間以内の予定なし）")
    lines.push("Decision Pack: 今回は不要")
  }
  alert.message = lines.join("\n")
  alert.addAction("OK")
  await alert.presentAlert()
}

function stableHash(input) {
  let hash = 2166136261
  const text = String(input || "")
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function addBatteryWarning(label, device, threshold, reason, reasons, lines) {
  if (!device || device.level == null || device.stale) return
  if (device.level < threshold) {
    reasons.push(reason)
    lines.push(`${label} ${device.level}%${device.charging ? "（充電中）" : ""}`)
  }
}

function parseEventNotes(notes) {
  const lines = String(notes || "").split(/\r?\n/)
  let departureLeadMinutes = null
  const carryItems = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const departure = line.match(/^出発\s*[:：]\s*(\d{1,3})(?:\s*分)?\s*$/)
    if (departure) {
      const n = Number(departure[1])
      if (Number.isFinite(n) && n >= 0 && n <= 240) departureLeadMinutes = n
      continue
    }

    const carry = line.match(/^持(?:ち物)?\s*[:：]\s*(.+)$/)
    if (carry) {
      for (const item of carry[1].split(/[、,，・]/)) {
        const clean = item.trim()
        if (clean && !carryItems.includes(clean)) carryItems.push(clean)
      }
    }
  }

  return { departureLeadMinutes, carryItems }
}

async function sendNotification(decision) {
  const n = new Notification()
  n.title = "出発チェック"

  const lines = []
  if (decision.nextEvent) {
    lines.push(`次: ${formatTime(decision.nextEvent.startDate)} ${decision.nextEvent.title || "予定"}`)
    if (decision.departureAt) lines.push(`出発目安: ${formatTime(decision.departureAt)}`)
    if (decision.nextEvent.location) lines.push(`場所: ${decision.nextEvent.location}`)
  }
  lines.push(...decision.warningLines.map(x => `⚠︎ ${x}`))
  n.body = lines.join("\n")
  n.threadIdentifier = "yos-departure-guard"
  await n.schedule()
}

function makeFingerprint(event, reasons) {
  const eventPart = event ? `${event.identifier || event.title}|${event.startDate.getTime()}` : "no-event"
  return `${eventPart}|${[...new Set(reasons)].sort().join(",")}`
}

function isDuplicate(fingerprint) {
  if (!fingerprint || !fm.fileExists(statePath)) return false
  try {
    const state = JSON.parse(fm.readString(statePath))
    if (state.fingerprint !== fingerprint) return false
    return Date.now() - Number(state.notifiedAt || 0) < CONFIG.duplicateSuppressMinutes * 60 * 1000
  } catch (_) {
    return false
  }
}

function rememberNotification(fingerprint) {
  try {
    fm.writeString(statePath, JSON.stringify({ fingerprint, notifiedAt: Date.now() }))
  } catch (_) {}
}

function parseInvocation(raw, queryParameters) {
  const out = { source: "auto", mode: CONFIG.defaultMode }

  function applyObject(value) {
    if (!value || typeof value !== "object") return
    if (value.source) out.source = String(value.source).trim().toLowerCase() || "auto"
    if (value.mode) out.mode = normalizeMode(value.mode)
  }

  if (typeof raw === "object" && raw != null) {
    applyObject(raw)
  } else if (typeof raw === "string") {
    const text = raw.trim()
    if (text) {
      try {
        const obj = JSON.parse(text)
        if (obj && typeof obj === "object") applyObject(obj)
        else {
          const lowered = text.toLowerCase()
          if (["shadow", "active"].includes(lowered)) out.mode = lowered
          else out.source = lowered
        }
      } catch (_) {
        const lowered = text.toLowerCase()
        if (["shadow", "active"].includes(lowered)) out.mode = lowered
        else out.source = lowered
      }
    }
  }

  // URL-scheme invocation is authoritative for automation context.
  // Scriptable exposes arbitrary query parameters through args.queryParameters.
  applyObject(queryParameters)
  return out
}

function normalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase()
  return mode === "active" ? "active" : "shadow"
}

function formatTime(date) {
  const f = new DateFormatter()
  f.useShortTimeStyle()
  return f.string(date)
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}
