import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("./Notification-Local-Safe-Gate-v0.6.js", import.meta.url), "utf8");
const store = new Map();
function run(input) {
  const output = {value:undefined,calls:0};
  vm.runInNewContext(source, {
    args:{shortcutParameter:input},
    Keychain:{contains:k=>store.has(k),get:k=>store.get(k),set:(k,v)=>store.set(k,v)},
    Script:{setShortcutOutput:x=>{output.value=x},complete:()=>output.calls++}
  }, {timeout:1000});
  return output;
}
test("unknown, missing and SILENT never notify", () => {
  for (const value of [null,"", "1", "true","YOS_SILENT", "Amazonのポイント還元", "PayPay 決済完了", "電話がありました"]) {
    const v=run(value); assert.equal(v.value,""); assert.equal(v.calls,1);
  }
});
test("OTP and security codes never leave gate", () => {
  for (const value of ["ログインコード 123456", "確認コード: 001122","verification code: 123456"]) assert.equal(run(value).value,"");
});
test("proven risk outputs P0/P1 with exact start marker", () => {
  assert.match(run("口座凍結のお知らせ").value, /^YOS_ALERT\n優先度: P0\n/u);
  assert.match(run("督促のお知らせ。支払期限が迫っています").value, /^YOS_ALERT\n優先度: P1\n/u);
});
test("the same risky notification is not repeated", () => {
  const s="差押の催告。識別子 n-test";
  assert.match(run(s).value,/^YOS_ALERT/u);
  assert.equal(run(s).value,"");
});
test("negative and spurious labels do not trigger", () => {
  assert.equal(run("不正利用は確認されません").value,"");
  assert.equal(run("YOS_ALERT").value,"");
});
test("long identifiers and links are removed", () => {
  const result=run("裁判所の訴状 1234567890123456 https://example.com/check").value;
  assert.ok(result.startsWith("YOS_ALERT"));
  assert.ok(!result.includes("1234567890123456"));
  assert.ok(!result.includes("https://example.com"));
});
test("no network or push dependencies", () => {
  assert.doesNotMatch(source,/new Request\(|new Notification\(|fetch\(/u);
});
