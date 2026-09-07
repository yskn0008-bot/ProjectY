// One-time updater for YOS Tapo H110 Setup.
// Scriptable's local WebView may not expose WebCrypto unless it has a secure HTTPS origin.

const SOURCE_URL = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/codex/issue-297-my-remote-widgets/ios-app/scriptable/remote-widgets/YOS%20Tapo%20H110%20Setup.js';

const req = new Request(SOURCE_URL);
const source = await req.loadString();

const cls = source.indexOf('class WebCryptoBox');
const start = source.indexOf('  async init() {', cls);
const end = source.indexOf('  async call(expr)', start);
if (cls < 0 || start < 0 || end < 0) throw new Error('更新対象を見つけられませんでした。');

const init = `  async init() {
    const boot = \`<!doctype html><meta charset="utf-8"><script>
      function b2u(s){const x=atob(s),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a}
      function u2b(a){let s='';const u=new Uint8Array(a);for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)}
      async function dg(alg,s){return u2b(await crypto.subtle.digest(alg,b2u(s)))}
      async function ae(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['encrypt']);return u2b(await crypto.subtle.encrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))}
      async function ad(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['decrypt']);return u2b(await crypto.subtle.decrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))}
      function rnd(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return u2b(a)}
    <\\/script>\`;
    // WebCrypto requires a secure context in WKWebView. Give the locally loaded
    // HTML an HTTPS base origin first; fall back to a tiny HTTPS page if needed.
    await this.web.loadHTML(boot, 'https://example.com/');
    let ok = await this.web.evaluateJavaScript(\`String(!!(window.crypto && crypto.subtle))\`, false);
    if (ok !== 'true') {
      await this.web.loadURL('https://example.com/');
      await this.web.evaluateJavaScript(\`
        function b2u(s){const x=atob(s),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a}
        function u2b(a){let s='';const u=new Uint8Array(a);for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)}
        async function dg(alg,s){return u2b(await crypto.subtle.digest(alg,b2u(s)))}
        async function ae(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['encrypt']);return u2b(await crypto.subtle.encrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))}
        async function ad(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['decrypt']);return u2b(await crypto.subtle.decrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))}
        function rnd(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return u2b(a)}
        'ready';
      \`, false);
      ok = await this.web.evaluateJavaScript(\`String(!!(window.crypto && crypto.subtle))\`, false);
    }
    if (ok !== 'true') throw new Error('暗号処理を初期化できませんでした。');
  }
`;

const patched = source.slice(0, start) + init + source.slice(end);
const managers = [FileManager.local(), FileManager.iCloud()];
for (const fm of managers) {
  const path = fm.joinPath(fm.documentsDirectory(), 'YOS Tapo H110 Setup.js');
  fm.writeString(path, patched);
}

const a = new Alert();
a.title = 'H110 修正完了';
a.message = 'YOS Tapo H110 Setup をもう一度実行してください。入力済みの接続情報はKeychainに残っています。';
a.addAction('OK');
await a.presentAlert();
