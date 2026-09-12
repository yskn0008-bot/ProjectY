// YOS Departure Guard v0.1
// Silent-by-default departure check for Scriptable on iPhone.
// Reuses YOS Battery Widget's local data and iOS Calendar data.
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
  version: "0.1",
  lookAheadHours: 6,
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
}

const fm = FileManager.local()
const batteryPath = fm.joinPath(fm.documentsDirectory(), CONFIG.batteryDataFile)
const statePath = fm.joinPath(fm.documentsDirectory(), CONFIG.stateFile)
const now = new Date()
const source = parseSource(args.shortcutParameter)

await main()

async function main() {
  const nextEvent = await findNextEvent(now)
  const battery = readBatterySnapshot()
  const decision = decide({ now, source, nextEvent, battery })

  if (decision.shouldNotify && !isDuplicate(decision.fingerprint)) {
    await sendNotification(decision)
    rememberNotification(decision.fingerprint)
  }

  Script.setShortcutOutput({
    ok: true,
    version: CONFIG.version,
    source,
    notified: decision.shouldNotify && !decision.duplicate,
    reasons: decision.reasons,
    nextEvent: nextEvent ? {
      title: nextEvent.title,
      startDate: nextEvent.startDate.toISOString(),
      location: nextEvent.location || null,
      departureAt: decision.departureAt ? decision.departureAt.toISOString() : null,
      departureLeadMinutes: decision.departureLeadMinutes,
      carryItems: decision.carryItems,
    } : null,
    battery,
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

function parseSource(raw) {
  if (raw == null) return "auto"
  if (typeof raw === "object" && raw.source) return String(raw.source).trim().toLowerCase()
  if (typeof raw === "string") {
    const text = raw.trim()
    if (!text) return "auto"
    try {
      const obj = JSON.parse(text)
      if (obj && obj.source) return String(obj.source).trim().toLowerCase()
    } catch (_) {}
    return text.toLowerCase()
  }
  return "auto"
}

function formatTime(date) {
  const f = new DateFormatter()
  f.useShortTimeStyle()
  return f.string(date)
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}
