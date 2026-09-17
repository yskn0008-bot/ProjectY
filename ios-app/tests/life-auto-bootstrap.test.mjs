import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../scriptable/life-auto/YOS Life AUTO Bootstrap.js', import.meta.url), 'utf8')

assert.match(source, /bb4c089e6e3ea701e4bea66bc9e6117057031ec2/)
assert.match(source, /YOS Life AUTO Installer\.js/)
assert.match(source, /YOS Life AUTO Installer v0\.2/)
assert.match(source, /FORBIDDEN_MARKERS/)
assert.match(source, /FileManager\.iCloud\(\)/)
assert.match(source, /fm\.writeString\(target, source\)/)
assert.match(source, /fm\.readString\(target\) !== source/)
assert.match(source, /scriptable:\/\/\/run\?scriptName=/)

console.log('life-auto-bootstrap tests: PASS')
