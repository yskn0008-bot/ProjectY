// YOS Tapo H110 Setup / Probe
// Reads Tapo H110 IR remotes over local KLAP v2 and stores a sanitized device map.
// Secrets stay in Scriptable Keychain and are never written into this source.

const K = Object.freeze({
  host: 'yos.tapo.h110.host',
  user: 'yos.tapo.h110.user',
  pass: 'yos.tapo.h110.pass',
  map: 'yos.tapo.h110.remote-map'
});

function kc(key) { return Keychain.contains(key) ? Keychain.get(key) : ''; }
function normalizeHost(value) {
  const v = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
  if (!v || /[\s/?#]/.test(v)) throw new Error('H110のIPアドレスを確認してください。');
  return v;
}
function concat(...parts) { return parts.flatMap(x => Array.from(x || [])); }
function utf8(s) { return Data.fromString(String(s)).getBytes(); }
function b64(bytes) { return Data.fromBytes(Array.from(bytes)).toBase64String(); }
function fromB64(s) { const d = Data.fromBase64String(s); return d ? d.getBytes() : []; }
function eq(a, b) { if (!a || !b || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i]; return x === 0; }
function int32be(n) { n |= 0; return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function readInt32be(bytes, off = 0) { return ((bytes[off] << 24) | (bytes[off+1] << 16) | (bytes[off+2] << 8) | bytes[off+3]) | 0; }
function decodeMaybeBase64(s) {
  if (!s || typeof s !== 'string') return s || '';
  try {
    const d = Data.fromBase64String(s);
    if (!d) return s;
    const t = d.toRawString();
    return t && /[\p{L}\p{N}\s\-+_/()]/u.test(t) ? t : s;
  } catch (_) { return s; }
}

class WebCryptoBox {
  constructor() { this.web = new WebView(); }
  async init() {
    await this.web.loadHTML(`<!doctype html><meta charset="utf-8"><script>
      function b2u(s){const x=atob(s),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a}
      function u2b(a){let s='';const u=new Uint8Array(a);for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)}
      async function dg(alg,s){return u2b(await crypto.subtle.digest(alg,b2u(s)))}
      async function ae(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['encrypt']);return u2b(await crypto.subtle.encrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))}
      async function ad(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['decrypt']);return u2b(await crypto.subtle.decrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))}
      function rnd(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return u2b(a)}
    <\/script>`);
    const ok = await this.web.evaluateJavaScript(`String(!!(window.crypto && crypto.subtle))`, false);
    if (ok !== 'true') throw new Error('このScriptable環境では暗号処理を開始できません。');
  }
  async call(expr) {
    const raw = await this.web.evaluateJavaScript(`(async()=>{try{return JSON.stringify({ok:1,v:await (${expr})})}catch(e){return JSON.stringify({ok:0,e:String(e)})}})().then(completion)`, true);
    const out = JSON.parse(raw);
    if (!out.ok) throw new Error('暗号処理エラー: ' + out.e);
    return out.v;
  }
  async digest(alg, bytes) { return fromB64(await this.call(`dg(${JSON.stringify(alg)},${JSON.stringify(b64(bytes))})`)); }
  async sha1(bytes) { return this.digest('SHA-1', bytes); }
  async sha256(bytes) { return this.digest('SHA-256', bytes); }
  async random(n) { return fromB64(await this.call(`rnd(${Number(n)})`)); }
  async aesEncrypt(key, iv, bytes) { return fromB64(await this.call(`ae(${JSON.stringify(b64(key))},${JSON.stringify(b64(iv))},${JSON.stringify(b64(bytes))})`)); }
  async aesDecrypt(key, iv, bytes) { return fromB64(await this.call(`ad(${JSON.stringify(b64(key))},${JSON.stringify(b64(iv))},${JSON.stringify(b64(bytes))})`)); }
}

class KlapV2 {
  constructor(host, username, password, crypto) {
    this.host = host; this.username = username; this.password = password; this.crypto = crypto;
    this.cookie = ''; this.key = null; this.ivPrefix = null; this.sig = null; this.seq = 0;
  }
  async post(path, bytes, cookie = '', query = '') {
    const r = new Request(`http://${this.host}/app/${path}${query}`);
    r.method = 'POST';
    r.timeoutInterval = 8;
    r.headers = {'Content-Type':'application/octet-stream'};
    if (cookie) r.headers.Cookie = cookie;
    r.body = Data.fromBytes(bytes);
    const data = await r.load();
    const status = r.response ? r.response.statusCode : 0;
    if (status < 200 || status >= 300) {
      const e = new Error(`H110通信エラー HTTP ${status}`); e.status = status; throw e;
    }
    return {bytes: data ? data.getBytes() : [], response: r.response || {}};
  }
  async authHash() {
    const u = await this.crypto.sha1(utf8(this.username));
    const p = await this.crypto.sha1(utf8(this.password));
    return this.crypto.sha256(concat(u, p));
  }
  async handshake() {
    const auth = await this.authHash();
    const local = await this.crypto.random(16);
    const h1 = await this.post('handshake1', local);
    if (h1.bytes.length < 48) throw new Error('H110のKLAP応答が不完全です。');
    const remote = h1.bytes.slice(0, 16), serverHash = h1.bytes.slice(16, 48);
    const expected = await this.crypto.sha256(concat(local, remote, auth));
    if (!eq(expected, serverHash)) throw new Error('Tapoアカウントのメールアドレスまたはパスワードが一致しません。');
    const cookies = (h1.response && h1.response.cookies) || [];
    const session = cookies.find(c => c && c.name === 'TP_SESSIONID');
    if (!session) throw new Error('H110からセッションCookieを取得できませんでした。');
    this.cookie = `TP_SESSIONID=${session.value}`;
    const h2Payload = await this.crypto.sha256(concat(remote, local, auth));
    await this.post('handshake2', h2Payload, this.cookie);
    const keyHash = await this.crypto.sha256(concat(utf8('lsk'), local, remote, auth));
    const ivHash = await this.crypto.sha256(concat(utf8('iv'), local, remote, auth));
    const sigHash = await this.crypto.sha256(concat(utf8('ldk'), local, remote, auth));
    this.key = keyHash.slice(0,16);
    this.ivPrefix = ivHash.slice(0,12);
    this.seq = readInt32be(ivHash, 28);
    this.sig = sigHash.slice(0,28);
  }
  async query(payload, retry = true) {
    if (!this.key) await this.handshake();
    this.seq = (this.seq + 1) | 0;
    const seqBytes = int32be(this.seq), iv = concat(this.ivPrefix, seqBytes);
    const clear = utf8(JSON.stringify(payload));
    const cipher = await this.crypto.aesEncrypt(this.key, iv, clear);
    const signature = await this.crypto.sha256(concat(this.sig, seqBytes, cipher));
    try {
      const resp = await this.post('request', concat(signature, cipher), this.cookie, `?seq=${this.seq}`);
      if (resp.bytes.length < 33) throw new Error('H110の暗号化応答が不完全です。');
      const plain = await this.crypto.aesDecrypt(this.key, iv, resp.bytes.slice(32));
      const text = Data.fromBytes(plain).toRawString();
      if (!text) throw new Error('H110応答をJSONとして復号できませんでした。');
      const obj = JSON.parse(text);
      if (obj && obj.error_code && obj.error_code !== 0) throw new Error(`Tapo error_code ${obj.error_code}`);
      return obj;
    } catch (e) {
      if (retry && (e.status === 403 || /session|security|403/i.test(String(e.message)))) {
        this.key = null; this.cookie = ''; await this.handshake(); return this.query(payload, false);
      }
      throw e;
    }
  }
  getDeviceInfo() { return this.query({method:'get_device_info'}); }
  getChildren(start = 0) { return this.query({method:'get_child_device_list',params:{start_index:start}}); }
  fire(deviceId, keyName) {
    return this.query({method:'control_child',params:{device_id:deviceId,requestData:{method:'multipleRequest',params:{requests:[{method:'sendIrCmdById',params:{name:keyName}}]}}}});
  }
}

async function configure() {
  const a = new Alert();
  a.title = 'Tapo H110 接続設定';
  a.message = 'Tapoアカウント情報はこのiPhoneのKeychainにだけ保存します。チャットやGitHubには送信しません。';
  a.addTextField('H110のIPアドレス', kc(K.host));
  a.addTextField('Tapoアカウントのメール', kc(K.user));
  a.addSecureTextField(kc(K.pass) ? 'パスワード（変更しないなら空欄）' : 'Tapoアカウントのパスワード', '');
  a.addAction('保存して接続'); a.addCancelAction('キャンセル');
  if (await a.presentAlert() < 0) return null;
  const host = normalizeHost(a.textFieldValue(0));
  const user = a.textFieldValue(1).trim();
  const entered = a.textFieldValue(2);
  const pass = entered || kc(K.pass);
  if (!user || !pass) throw new Error('メールアドレスとパスワードを入力してください。');
  Keychain.set(K.host, host); Keychain.set(K.user, user); Keychain.set(K.pass, pass);
  return {host,user,pass};
}

async function credentials() {
  const host = kc(K.host), user = kc(K.user), pass = kc(K.pass);
  return host && user && pass ? {host,user,pass} : configure();
}

function normalizeResult(obj) {
  if (!obj || typeof obj !== 'object') return {};
  if (obj.result && typeof obj.result === 'object') return obj.result;
  return obj;
}

async function readAllChildren(client) {
  const all = []; let start = 0;
  for (let page = 0; page < 20; page++) {
    const raw = normalizeResult(await client.getChildren(start));
    const list = Array.isArray(raw.child_device_list) ? raw.child_device_list : [];
    for (const child of list) all.push(child);
    const sum = Number.isInteger(raw.sum) ? raw.sum : all.length;
    if (!list.length || all.length >= sum) break;
    start = all.length;
  }
  return all;
}

function sanitizedMap(children) {
  return children.map(child => ({
    device_id: String(child.device_id || ''),
    nickname: decodeMaybeBase64(child.nickname || ''),
    model: child.model || '',
    category: child.category || '',
    key_sum: child.key_sum || (Array.isArray(child.key_list) ? child.key_list.length : 0),
    keys: (Array.isArray(child.key_list) ? child.key_list : []).map(k => ({
      name: String(k.name || ''),
      label: decodeMaybeBase64(k.display_name || '') || String(k.name || ''),
      id: k.id == null ? null : k.id,
      order: k.order == null ? null : k.order,
      type: k.type == null ? null : k.type
    })),
    ac: child.model === 'AC' ? {
      power: child.power_on,
      mode: child.mode,
      temp: child.temp,
      fan_speed: child.fan_speed,
      swing: child.swing,
      vertical_swing: child.vertical_swing,
      horizontal_swing: child.horizontal_swing
    } : null
  }));
}

async function showMap(map, info) {
  const table = new UITable(); table.showSeparators = true;
  const head = new UITableRow(); head.isHeader = true;
  head.addText(`Tapo H110 · ${map.length} リモコン`, info.model || '接続成功'); table.addRow(head);
  for (const remote of map) {
    const r = new UITableRow(); r.height = 58;
    r.addText(remote.nickname || remote.model || '名称なし', `${remote.model || 'Custom'} · ${remote.keys.length}キー`);
    r.onSelect = async () => {
      const t = new UITable(); t.showSeparators = true;
      const h = new UITableRow(); h.isHeader = true; h.addText(remote.nickname || 'リモコン', remote.model || ''); t.addRow(h);
      if (!remote.keys.length) { const x = new UITableRow(); x.addText('個別キーなし', remote.model === 'AC' ? 'エアコンは状態制御方式の可能性があります' : ''); t.addRow(x); }
      for (const key of remote.keys) { const kr = new UITableRow(); kr.addText(key.label || key.name, key.name); t.addRow(kr); }
      await t.present(false);
    };
    table.addRow(r);
  }
  await table.present(false);
}

async function main() {
  try {
    const c = await credentials(); if (!c) return;
    const crypto = new WebCryptoBox(); await crypto.init();
    const client = new KlapV2(c.host, c.user, c.pass, crypto);
    const info = normalizeResult(await client.getDeviceInfo());
    const children = await readAllChildren(client);
    const map = sanitizedMap(children);
    Keychain.set(K.map, JSON.stringify(map));
    await showMap(map, info);
  } catch (e) {
    const a = new Alert(); a.title = 'Tapo H110'; a.message = e && e.message ? e.message : String(e);
    a.addAction('設定をやり直す'); a.addCancelAction('閉じる');
    if (await a.presentAlert() === 0) { for (const k of [K.host,K.user,K.pass]) if (Keychain.contains(k)) Keychain.remove(k); await main(); }
  }
}

await main();
Script.complete();
