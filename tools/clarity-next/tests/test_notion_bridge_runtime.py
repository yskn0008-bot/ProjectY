"""Runtime regression for the existing Clarity Notion inline Scriptable bridge.

Runs a simulated Scriptable/Notion environment. No live records are written.
"""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import shutil
import subprocess
import unittest

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "patch_notion_inline_bridge.py"
spec = spec_from_file_location("notion_bridge_patch_under_test", SCRIPT_PATH)
module = module_from_spec(spec)
spec.loader.exec_module(module)

NODE_TEST = r"""
const assert = require('node:assert/strict');
const vm = require('node:vm');
const script = process.argv[1];
let pages = [], local = '', serial = 0, createdCount = 0, failReadback = false;
const DS = '965c6086-32c1-463d-93b4-87a9cb69b3ad';
async function capture(id, raw) {
  let output;
  const fm = {
    documentsDirectory: () => '/tmp',
    joinPath: (p, n) => p + '/' + n,
    fileExists: () => Boolean(local),
    readString: () => local,
    writeString: (p, v) => { local = v; }
  };
  class Request {
    constructor(url) { this.url=url; this.method='GET'; this.response={statusCode:200}; }
    async loadJSON() {
      if (this.url.endsWith('/data_sources/' + DS + '/query')) {
        const k=JSON.parse(this.body).filter.rich_text.equals;
        return {results: pages.filter(p => p.key === k).map(p => ({id:p.id}))};
      }
      if (this.url.endsWith('/pages') && this.method === 'POST') {
        const props=JSON.parse(this.body).properties;
        const key=props['同期キー'].rich_text[0].text.content;
        const page={id:'page-' + (++serial),key};
        pages.push(page);createdCount++;
        return {id:page.id};
      }
      if (this.url.includes('/pages/')) {
        const id=this.url.split('/').at(-1);
        const page=pages.find(p => p.id === id);
        if (!page) {this.response.statusCode=404;return {error:'not found'};}
        return {properties:{'同期キー':{rich_text:[{plain_text:failReadback?'wrong-key':page.key}]}}};
      }
      throw new Error('Unexpected Notion request ' + this.url);
    }
  }
  const context={
    args:{plainTexts:[new URLSearchParams({request_id:id,target:'task',title:'YOS動作テスト',raw}).toString()]},
    Keychain:{contains:()=>true,get:()=> 'simulated-token'},
    Request, FileManager:{local:()=>fm},
    Script:{setShortcutOutput:v=>{output=v;},complete:()=>{}},
    Date, Number, String, JSON, Math, Error, decodeURIComponent
  };
  await vm.runInNewContext('(async()=>{' + script + '})()', context);
  return output;
}
(async()=>{
  assert.equal(await capture('test-001','テストタスクを登録'),'OK:task');
  assert.equal(createdCount,1);
  local=''; // Local state loss must not duplicate a Notion task.
  assert.equal(await capture('test-002','テストタスクを登録'),'DUPLICATE:task');
  assert.equal(createdCount,1);
  assert.equal(await capture('test-003','別のタスクを登録'),'OK:task');
  assert.equal(createdCount,2);
  failReadback=true;
  await assert.rejects(capture('test-004','再試行するタスクを登録'),/readback did not match/);
  assert.equal(createdCount,3);
  failReadback=false;
  local='';
  assert.equal(await capture('test-005','再試行するタスクを登録'),'DUPLICATE:task');
  assert.equal(createdCount,3);
  console.log('Notion task dedupe/readback/retry simulation: PASS');
})().catch(e => {console.error(e); process.exitCode=1;});
"""

class NotionBridgeRuntimeTests(unittest.TestCase):
    def test_task_idempotency_and_readback(self):
        if not shutil.which("node"):
            self.skipTest("Node.js is not installed in this environment")
        result = subprocess.run(
            ["node", "-e", NODE_TEST, module.BRIDGE_SCRIPT],
            capture_output=True, text=True, timeout=25, check=False
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PASS", result.stdout)

if __name__ == "__main__":
    unittest.main()
