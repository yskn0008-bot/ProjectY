import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../scriptable/life-auto/YOS Life AUTO Bootstrap.js', import.meta.url), 'utf8')

assert.match(source, /bc803305438d7fa3aeb48b67f9fb26f2d46163d1/)
assert.match(source, /YOS Life AUTO Installer\.js/)
assert.match(source, /YOS Life AUTO Installer v0\.3/)
assert.match(source, /FORBIDDEN_MARKERS/)
assert.match(source, /FileManager\.iCloud\(\)/)
assert.match(source, /fm\.writeString\(target, source\)/)
assert.match(source, /fm\.readString\(target\) !== source/)
assert.match(source, /scriptable:\/\/\/run\?scriptName=/)

console.log('life-auto-bootstrap tests: PASS')
