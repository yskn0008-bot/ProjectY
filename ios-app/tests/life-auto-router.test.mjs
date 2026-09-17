import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../scriptable/life-auto/YOS Life AUTO Router.js', import.meta.url), 'utf8')

async function run(input) {
  let output = null
  const keychain = new Map()
  const opened = []

  class FakeCallbackURL {
    constructor(baseURL) {
      this.baseURL = baseURL
      this.params = new Map()
    }
    addParameter(key, value) { this.params.set(key, value) }
    async open() {
      const name = this.params.get('name')
      opened.push({ baseURL: this.baseURL, name })
      return { result: `ran:${name}` }
    }
  }

  const context = {
    args: { shortcutParameter: input },
    Keychain: { set: (key, value) => keychain.set(key, value) },
    CallbackURL: FakeCallbackURL,
    Script: {
      setShortcutOutput: value => { output = value },
      complete: () => {}
    },
    console,
    Date,
    setTimeout,
    clearTimeout
  }
  vm.runInNewContext(source, context)
  for (let i = 0; i < 20 && output === null; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.notEqual(output, null, 'router did not finish')
  return { plan: JSON.parse(output), keychain, opened }
}

const expected = {
  '起床': ['Morning Flow', 'YOS Battery Sync'],
  '外出': ['YOS Battery Sync'],
  '車': [],
  '仕事': [],
  '帰宅': ['YOS Battery Sync'],
  '就寝': ['Night Reset', 'YOS Battery Sync']
}

for (const [input, names] of Object.entries(expected)) {
  const { plan, keychain, opened } = await run(input)
  assert.equal(plan.ok, true, input)
  assert.deepEqual(plan.actions.map(x => x.name), names, input)
  assert.deepEqual(opened.map(x => x.name), names, input)
  assert.equal(keychain.has('yos.life.auto.state.v1'), true, input)
  assert.equal(plan.execution.every(x => x.ok), true, input)
}

{
  const { plan, keychain, opened } = await run('知らない状態')
  assert.equal(plan.ok, false)
  assert.equal(plan.reason, 'unknown_state')
  assert.deepEqual(plan.actions, [])
  assert.equal(keychain.size, 0)
  assert.deepEqual(opened, [])
}

{
  const { plan, opened } = await run(JSON.stringify({ state: 'morning', dryRun: true }))
  assert.equal(plan.state, 'wake')
  assert.equal(plan.execute, false)
  assert.deepEqual(opened, [])
}

console.log('life-auto-router tests: PASS')
