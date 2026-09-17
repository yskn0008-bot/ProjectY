// YOS Life AUTO Router v0.2
// Receives a life-state from iOS Shortcuts, persists it, and executes only the
// allowlisted existing shortcuts for that state through Apple's x-callback URL.

const SCHEMA = 'yos.life-auto-router.v0.2'
const STATE_KEY = 'yos.life.auto.state.v1'
const SHORTCUT_CALLBACK = 'shortcuts://x-callback-url/run-shortcut'

const ROUTES = {
  wake: {
    label: '起床',
    aliases: ['wake', 'wakeup', '起床', 'おはよう', 'morning'],
    actions: [
      { type: 'runShortcut', name: 'Morning Flow' },
      { type: 'runShortcut', name: 'YOS Battery Sync' }
    ]
  },
  out: {
    label: '外出',
    aliases: ['out', 'leave', '外出', '出発'],
    actions: [
      { type: 'runShortcut', name: 'YOS Battery Sync' }
    ]
  },
  car: {
    label: '車',
    aliases: ['car', 'drive', '車', '運転'],
    actions: []
  },
  work: {
    label: '仕事',
    aliases: ['work', '仕事', '勤務'],
    actions: []
  },
  home: {
    label: '帰宅',
    aliases: ['home', 'return', '帰宅', '家'],
    actions: [
      { type: 'runShortcut', name: 'YOS Battery Sync' }
    ]
  },
  sleep: {
    label: '就寝',
    aliases: ['sleep', 'bed', '就寝', 'おやすみ', 'night'],
    actions: [
      { type: 'runShortcut', name: 'Night Reset' },
      { type: 'runShortcut', name: 'YOS Battery Sync' }
    ]
  }
}

function clean(value) {
  return String(value ?? '').trim().toLowerCase()
}

function parseInput(value) {
  if (value && typeof value === 'object') return value
  const text = String(value ?? '').trim()
  if (!text) return {}
  if (text.startsWith('{')) {
    try { return JSON.parse(text) } catch (_) {}
  }
  return { state: text }
}

function normalizeState(value) {
  const wanted = clean(value)
  for (const [id, route] of Object.entries(ROUTES)) {
    if (id === wanted || route.aliases.some(alias => clean(alias) === wanted)) return id
  }
  return null
}

function buildPlan(input) {
  const parsed = parseInput(input)
  const state = normalizeState(parsed.state ?? parsed.status ?? parsed.mode ?? input)
  const now = new Date().toISOString()
  const execute = parsed.execute !== false && parsed.dryRun !== true

  if (!state) {
    return {
      schema: SCHEMA,
      ok: false,
      state: null,
      label: '未判定',
      actions: [],
      execute: false,
      changedAt: now,
      reason: 'unknown_state'
    }
  }

  const route = ROUTES[state]
  return {
    schema: SCHEMA,
    ok: true,
    state,
    label: route.label,
    actions: route.actions,
    execute,
    changedAt: now,
    pilot: true
  }
}

function persist(plan) {
  if (!plan.ok || typeof Keychain === 'undefined') return
  const snapshot = JSON.stringify({
    schema: plan.schema,
    state: plan.state,
    label: plan.label,
    changedAt: plan.changedAt
  })
  Keychain.set(STATE_KEY, snapshot)
}

async function runShortcut(name) {
  if (typeof CallbackURL === 'undefined') {
    throw new Error('CallbackURL unavailable')
  }
  const callback = new CallbackURL(SHORTCUT_CALLBACK)
  callback.addParameter('name', name)
  return await callback.open()
}

async function executePlan(plan) {
  const results = []
  if (!plan.ok || !plan.execute) return results

  for (const action of plan.actions) {
    if (action.type !== 'runShortcut') continue
    try {
      const response = await runShortcut(action.name)
      results.push({ name: action.name, ok: true, response: response ?? null })
    } catch (error) {
      results.push({ name: action.name, ok: false, error: String(error?.message ?? error) })
    }
  }
  return results
}

function finish(plan, execution) {
  const payload = { ...plan, execution }
  const text = JSON.stringify(payload)
  if (typeof Script !== 'undefined' && typeof Script.setShortcutOutput === 'function') {
    Script.setShortcutOutput(text)
    if (typeof Script.complete === 'function') Script.complete()
  } else if (typeof console !== 'undefined') {
    console.log(text)
  }
}

async function main() {
  const shortcutInput = typeof args !== 'undefined' ? args.shortcutParameter : null
  const plan = buildPlan(shortcutInput)
  persist(plan)
  const execution = await executePlan(plan)
  finish(plan, execution)
}

main()
