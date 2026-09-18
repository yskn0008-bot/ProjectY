// YOS Departure Guard Active Acceptance v0.1
// One-run physical acceptance for local Notification + duplicate suppression.
// Does not change YOS Departure Guard2. Temporarily uses the same state file, then restores it.

const CONFIG = {
  lookAheadHours: 6,
  defaultDepartureLeadMinutes: 45,
  notifyWhenDepartureWithinMinutes: 20,
  duplicateSuppressMinutes: 25,
  stateFile: "YOS-Departure-Guard-v0.json",
}

const fm = FileManager.local()
const statePath = fm.joinPath(fm.documentsDirectory(), CONFIG.stateFile)
const now = new Date()

const originalState = fm.fileExists(statePath) ? fm.readString(statePath) : null
let notificationScheduled = false
let duplicateBlocked = false
let stateRestored = false
let actionable = false
let eventLabel = "なし"

try {
  const nextEvent = await findNextEvent(now)
  if (!nextEvent) throw new Error("6時間以内の予定がありません")

  eventLabel = `${formatTime(nextEvent.startDate)} ${nextEvent.title || "予定"}`
  const departureAt = new Date(nextEvent.startDate.getTime() - CONFIG.defaultDepartureLeadMinutes * 60 * 1000)
  const minutesToDeparture = Math.ceil((departureAt.getTime() - now.getTime()) / 60000)
  actionable = minutesToDeparture <= CONFIG.notifyWhenDepartureWithinMinutes

  if (!actionable) {
    throw new Error(`テスト予定がまだ遠すぎます（出発目安まで ${minutesToDeparture}分）`)
  }

  const reason = minutesToDeparture <= 0 ? "departure_due" : "departure_soon"
  const fingerprint = makeFingerprint(nextEvent, [reason])

  // Start from a known empty state for this acceptance only.
  if (fm.fileExists(statePath)) fm.remove(statePath)

  if (!isDuplicate(fingerprint)) {
    const n = new Notification()
    n.title = "出発チェック（実機テスト）"
    n.body = `次: ${eventLabel}\n重複通知防止テスト 1回目`
    n.threadIdentifier = "yos-departure-guard-acceptance"
    await n.schedule()
    notificationScheduled = true
    rememberNotification(fingerprint)
  }

  // Immediate second evaluation must be blocked as duplicate.
  duplicateBlocked = isDuplicate(fingerprint)
} finally {
  try {
    if (originalState == null) {
      if (fm.fileExists(statePath)) fm.remove(statePath)
    } else {
      fm.writeString(statePath, originalState)
    }
    stateRestored = originalState == null
      ? !fm.fileExists(statePath)
      : (fm.fileExists(statePath) && fm.readString(statePath) === originalState)
  } catch (_) {
    stateRestored = false
  }
}

const alert = new Alert()
alert.title = "Active実機テスト"
alert.message = [
  `予定: ${eventLabel}`,
  `通知1回目: ${notificationScheduled ? "PASS" : "FAIL"}`,
  `2回目重複防止: ${duplicateBlocked ? "PASS" : "FAIL"}`,
  `元の状態へ復元: ${stateRestored ? "PASS" : "FAIL"}`,
  "",
  "YOS Departure Guard2 本体はShadowのままです。",
].join("\n")
alert.addAction("OK")
await alert.presentAlert()

Script.setShortcutOutput({
  ok: notificationScheduled && duplicateBlocked && stateRestored,
  notificationScheduled,
  duplicateBlocked,
  stateRestored,
  actionable,
  eventLabel,
})
Script.complete()

async function findNextEvent(fromDate) {
  const end = new Date(fromDate.getTime() + CONFIG.lookAheadHours * 60 * 60 * 1000)
  const events = await CalendarEvent.between(fromDate, end)
  return events
    .filter(e => !e.isAllDay && e.startDate && e.startDate.getTime() >= fromDate.getTime())
    .sort((a, b) => a.startDate - b.startDate)[0] || null
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
  fm.writeString(statePath, JSON.stringify({ fingerprint, notifiedAt: Date.now() }))
}

function formatTime(date) {
  const f = new DateFormatter()
  f.useShortTimeStyle()
  return f.string(date)
}
