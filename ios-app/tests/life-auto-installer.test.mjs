import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../scriptable/life-auto/YOS Life AUTO Installer.js', import.meta.url), 'utf8')

assert.match(source, /f7316540bcb0c8c975da7d5f49b0e298d090b344/)
assert.match(source, /YOS Life AUTO Router\.js/)
assert.match(source, /\.backup/)
assert.match(source, /assertSource\(written\)/)
assert.match(source, /fm\.writeString\(target, previous\)/)
assert.match(source, /fm\.remove\(target\)/)
assert.match(source, /YOS Life AUTO Installer v0\.3/)
assert.match(source, /YOS Life AUTO Router v0\.3/)
assert.match(source, /executor: 'ios-shortcuts'/)
assert.match(source, /FORBIDDEN_MARKERS/)
assert.match(source, /new CallbackURL/)
assert.match(source, /shortcuts:\/\/x-callback-url\/run-shortcut/)
assert.doesNotMatch(source, /FORBIDDEN_MARKERS = \['CallbackURL'/)

console.log('life-auto-installer tests: PASS')
