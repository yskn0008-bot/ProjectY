import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../scriptable/life-auto/YOS Life AUTO Router.js', import.meta.url), 'utf8')

function run(input) {
  let output = null
  const keychain = new Map()
  const context = {
    args: { shortcutParameter: input },
    Keychain: { set: (key, value) => keychain.set(key, value) },
    Script: {
      setShortcutOutput: value => { output = value },
      complete: () => {}
    },
    console,
    Date
  }
  vm.runInNewContext(source, context)
  assert.notEqual(output, null, 'router did not finish')
  return { plan: JSON.parse(output), keychain }
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
  const { plan, keychain } = run(input)
  assert.equal(plan.ok, true, input)
  assert.deepEqual(plan.actions.map(x => x.name), names, input)
  assert.equal(plan.executor, 'ios-shortcuts', input)
  assert.equal(keychain.has('yos.life.auto.state.v1'), true, input)
}

{
  const { plan, keychain } = run('知らない状態')
  assert.equal(plan.ok, false)
  assert.equal(plan.reason, 'unknown_state')
  assert.deepEqual(plan.actions, [])
  assert.equal(keychain.size, 0)
}

{
  const { plan } = run(JSON.stringify({ state: 'morning' }))
  assert.equal(plan.state, 'wake')
  assert.deepEqual(plan.actions.map(x => x.name), ['Morning Flow', 'YOS Battery Sync'])
}

assert.doesNotMatch(source, /CallbackURL/)
assert.doesNotMatch(source, /x-callback-url/)

console.log('life-auto-router tests: PASS')
