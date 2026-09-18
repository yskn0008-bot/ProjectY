import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceUrl = new URL('./YOS%20Departure%20Guard.js', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')

test('reuses existing battery widget local file', () => {
  assert.match(source, /YOS-Battery-Widget-v1\.json/)
  assert.match(source, /raw\.devices/)
})

test('reads iPhone battery from Scriptable Device API', () => {
  assert.match(source, /Device\.batteryLevel\(\)/)
  assert.match(source, /Device\.isCharging\(\)/)
})

test('reads upcoming calendar events without creating or modifying them', () => {
  assert.match(source, /CalendarEvent\.between\(/)
  assert.doesNotMatch(source, /new CalendarEvent\s*\(/)
  assert.doesNotMatch(source, /\.save\(\)/)
  assert.doesNotMatch(source, /\.remove\(\)/)
})

test('is silent unless at least one actionable reason exists', () => {
  assert.match(source, /const shouldNotify = reasons\.length > 0/)
  assert.match(source, /if \(decision\.shouldNotify/)
})

test('supports exceptional carry-item and departure-lead metadata', () => {
  assert.match(source, /持\(\?:ち物\)\?/) // source regexp for 持: / 持ち物:
  assert.match(source, /出発\\s\*\[:：\]/)
})

test('does not contain network calls or obvious private-network credentials', () => {
  assert.doesNotMatch(source, /new Request\s*\(/)
  assert.doesNotMatch(source, /X-Auth-PSK/i)
  assert.doesNotMatch(source, /192\.168\./)
  assert.doesNotMatch(source, /10\.\d+\.\d+\.\d+/)
})

test('suppresses repeated identical notifications', () => {
  assert.match(source, /duplicateSuppressMinutes/)
  assert.match(source, /makeFingerprint\(/)
  assert.match(source, /rememberNotification\(/)
})


test('defaults to shadow mode and requires explicit active mode for notification', () => {
  assert.match(source, /defaultMode:\s*"shadow"/)
  assert.match(source, /invocation\.mode === "active" && gate\.level === "active"/)
  assert.doesNotMatch(source, /defaultMode:\s*"active"/)
})

test('builds a Decision Pack with audit fields and typed unapproved actions', () => {
  for (const field of [
    'candidate_id',
    'trigger_event_id',
    'created_at',
    'expires_at',
    'evidence',
    'confidence',
    'user_decision',
    'execution_result',
    'reversible',
  ]) assert.match(source, new RegExp(field))
  assert.match(source, /action:\s*"navigation\.start"/)
  assert.match(source, /approved_by_user:\s*false/)
  assert.doesNotMatch(source, /approved_by_user:\s*true/)
})

test('uses a local capped Event Store and logs fixed-rule baseline separately', () => {
  assert.match(source, /YOS-Departure-Guard-EventStore-v0\.json/)
  assert.match(source, /maxEventRecords:\s*200/)
  assert.match(source, /slice\(-CONFIG\.maxEventRecords\)/)
  assert.match(source, /baseline_would_notify/)
  assert.match(source, /fixedRuleWouldNotify/)
})

test('supports silent passive and active presentation levels', () => {
  assert.match(source, /level:\s*"silent"/)
  assert.match(source, /level:\s*"passive"/)
  assert.match(source, /level:\s*"active"/)
})

test('Decision Pack schema is machine-readable and keeps proposed actions unapproved', async () => {
  const schemaUrl = new URL('./decision-pack.schema.json', import.meta.url)
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'))
  assert.equal(schema.properties.schema_version.const, '0.2')
  assert.ok(schema.required.includes('candidate_id'))
  assert.ok(schema.required.includes('trigger_event_id'))
  const actionSchema = schema.properties.options.items.properties.action_contract.oneOf[1]
  assert.equal(actionSchema.properties.status.const, 'proposed')
  assert.equal(actionSchema.properties.approved_by_user.const, false)
})
