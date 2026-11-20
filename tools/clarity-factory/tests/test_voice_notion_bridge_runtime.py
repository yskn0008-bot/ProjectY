"""No-write runtime checks for the Clarity Voice test bridge."""
from pathlib import Path
import shutil
import subprocess
import unittest

BRIDGE = Path(__file__).resolve().parents[1] / "clarity_voice_notion_bridge.js"

NODE_TEST = r"""
const assert=require('node:assert/strict');
const vm=require('node:vm');
const script=process.argv[1];
let writes=0,requests=0;
async function run(payload){
  let output='';
  class Request{
    constructor(){requests++;throw new Error('dry-run must not make a request');}
  }
  const fm={
    documentsDirectory:()=>'/tmp',
    joinPath:(p,n)=>p+'/'+n,
    fileExists:()=>false,
    readString:()=> '',
    writeString:()=>{writes++;}
  };
  const context={
    args:{plainTexts:[payload]},
    Keychain:{contains:()=>{throw new Error('dry-run must not read credentials');},get:()=>{throw new Error('dry-run must not read credentials');}},
    Request,FileManager:{local:()=>fm},
    Script:{setShortcutOutput:v=>{output=v;},complete:()=>{}},
    Date,Number,String,JSON,Math,Error,decodeURIComponent,encodeURIComponent
  };
  await vm.runInNewContext('(async()=>{'+script+'})()',context);
  return output;
}
(async()=>{
  const result=await run('notionPending=yes&target=task&title='+encodeURIComponent('音声テスト')+'&raw='+encodeURIComponent('タスクをNotionに保存'));
  assert.equal(result,'DRYRUN:task');
  const skipped=await run('notionPending=no&target=task&title=x&raw=y');
  assert.equal(skipped,'SKIP:no_notion_save');
  assert.equal(requests,0,'test bridge must make zero Notion API requests');
  assert.equal(writes,0,'test bridge must make zero local receipt writes');
  console.log('Clarity Voice bridge dry-run, inactive-route rejection, and zero-write checks: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
"""

class ClarityVoiceNotionBridgeTests(unittest.TestCase):
    def test_test_copy_bridge_never_writes(self):
        if not shutil.which("node"):
            self.skipTest("Node.js is not installed in this environment")
        result=subprocess.run(
            ["node","-e",NODE_TEST,BRIDGE.read_text(encoding="utf-8")],
            capture_output=True,text=True,timeout=25,check=False
        )
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("PASS",result.stdout)

if __name__=="__main__":
    unittest.main()
