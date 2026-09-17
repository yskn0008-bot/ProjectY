import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../scriptable/life-auto/YOS Life AUTO Bootstrap.js', import.meta.url), 'utf8')

assert.match(source, /87af5bfe67c98946d4b6549f7c480fe52fd2839c/)
assert.match(source, /YOS Life AUTO Installer\.js/)
assert.match(source, /YOS Life AUTO Installer v0\.1/)
assert.match(source, /FileManager\.iCloud\(\)/)
assert.match(source, /fm\.writeString\(target, source\)/)
assert.match(source, /fm\.readString\(target\) !== source/)
assert.match(source, /scriptable:\/\/\/run\?scriptName=/)

console.log('life-auto-bootstrap tests: PASS')
