// One-time updater for YOS Tapo H110 Setup.
// Fixes Scriptable WKWebView WebCrypto initialization and callback return handling.

const SOURCE_URL = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/codex/issue-297-my-remote-widgets/ios-app/scriptable/remote-widgets/YOS%20Tapo%20H110%20Setup.js';

const req = new Request(SOURCE_URL);
const source = await req.loadString();

const cls = source.indexOf('class WebCryptoBox');
const initStart = source.indexOf('  async init() {', cls);
const callStart = source.indexOf('  async call(expr) {', initStart);
const digestStart = source.indexOf('  async digest(alg, bytes)', callStart);
if (cls < 0 || initStart < 0 || callStart < 0 || digestStart < 0) {
  throw new Error('更新対象を見つけられませんでした。');
}

const replacement = `  async init() {
    // WebCrypto is only exposed to a secure WKWebView origin.
    await this.web.loadURL('https://example.com/');
    const injected = await this.web.evaluateJavaScript(\`(() => {
      window.b2u = function(s){const x=atob(s),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a};
      window.u2b = function(a){let s='';const u=new Uint8Array(a);for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)};
      window.dg = async function(alg,s){return u2b(await crypto.subtle.digest(alg,b2u(s)))};
      window.ae = async function(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['encrypt']);return u2b(await crypto.subtle.encrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))};
      window.ad = async function(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['decrypt']);return u2b(await crypto.subtle.decrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))};
      window.rnd = function(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return u2b(a)};
      return String(!!(window.crypto && crypto.subtle));
    })()\`, false);
    if (String(injected) !== 'true') throw new Error('暗号処理を初期化できませんでした。');
  }
  async call(expr) {
    const js = \`(() => {
      (async () => {
        try {
          const value = await (\${expr});
          completion(JSON.stringify({ok:1,v:value}));
        } catch (e) {
          completion(JSON.stringify({ok:0,e:String(e)}));
        }
      })();
      return 'pending';
    })()\`;
    const raw = await this.web.evaluateJavaScript(js, true);
    const out = JSON.parse(String(raw));
    if (!out.ok) throw new Error('暗号処理エラー: ' + out.e);
    return out.v;
  }
`;

const patched = source.slice(0, initStart) + replacement + source.slice(digestStart);
for (const fm of [FileManager.local(), FileManager.iCloud()]) {
  const path = fm.joinPath(fm.documentsDirectory(), 'YOS Tapo H110 Setup.js');
  fm.writeString(path, patched);
}

const a = new Alert();
a.title = 'H110 修正 v2 完了';
a.message = 'YOS Tapo H110 Setup をもう一度実行してください。';
a.addAction('OK');
await a.presentAlert();
