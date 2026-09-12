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
