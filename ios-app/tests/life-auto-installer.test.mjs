import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../scriptable/life-auto/YOS Life AUTO Installer.js', import.meta.url), 'utf8')

assert.match(source, /067b558642b9a822887ca6e7a152241e96507a70/)
assert.match(source, /YOS Life AUTO Router\.js/)
assert.match(source, /\.backup/)
assert.match(source, /assertSource\(written\)/)
assert.match(source, /fm\.writeString\(target, previous\)/)
assert.match(source, /fm\.remove\(target\)/)
assert.match(source, /YOS Life AUTO Router v0\.2/)
assert.match(source, /shortcuts:\/\/x-callback-url\/run-shortcut/)

console.log('life-auto-installer tests: PASS')
