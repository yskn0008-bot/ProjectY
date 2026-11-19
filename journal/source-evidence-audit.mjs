/**
 * YOS JOURNAL research evidence audit (prototype, private / fail-closed).
 *
 * Downloads a small set of editor-selected PUBLIC sources and locates exact
 * supporting excerpts. It NEVER asserts that a factual claim is "verified".
 * A quote can be misleading, contradictory or out of context. Human/independent
 * semantic review + the existing editorial publication gate remain required.
 *
 * This module cannot publish, notify, read Notion or access credentials.
 */
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const MAX_SOURCES = 6;
const MAX_CLAIMS = 30;
const MAX_BYTES = 750000;
const PRIVATE = /(?:sk-proj-|ntn_[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]{16,}|Bearer\s+\S+|口座番号|マイナンバー|暗証番号|ようすけ|陽介|個人の予定|個人の残高|YOS_NOTION_INTEGRATION_TOKEN)/i;
const FIXED_HOSTS = new Set([
  'pmc.ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov',
  'www.ncbi.nlm.nih.gov', 'api.crossref.org',
  'www.jstage.jst.go.jp', 'www.nature.com',
  'www.pref.okinawa.lg.jp', 'www.city.naha.okinawa.jp'
]);

function requireText(value, name, minimum = 1, maximum = 500) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum ||
      /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid ' + name);
  return value.trim();
}
function onlyKeys(value, allowed, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid ' + name);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error('Unexpected ' + name + ' field: ' + key);
  }
}
export function safeSourceUrl(raw) {
  let parsed;
  try { parsed = new URL(requireText(raw, 'source URL', 18, 1100)); }
  catch { throw new Error('Invalid source URL'); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.port || parsed.hash || parsed.search || !host.includes('.') ||
      host.endsWith('.') || !(/^[a-z0-9.-]+$/).test(host) ||
      !(FIXED_HOSTS.has(host) || host.endsWith('.gov') || host.endsWith('.go.jp') ||
        host.endsWith('.ac.jp')) ) throw new Error('Unsafe or unsupported research source URL');
  return parsed.href;
}
export function validateResearchPacket(packet) {
  onlyKeys(packet, ['schemaVersion', 'publicOnly', 'topic', 'sources', 'claims'], 'packet');
  if (packet.schemaVersion !== 1 || packet.publicOnly !== true)
    throw new Error('Private or unsupported research packet');
  const raw = JSON.stringify(packet);
  if (raw.length > 45000 || PRIVATE.test(raw)) throw new Error('Private material not accepted');
  requireText(packet.topic, 'topic', 10, 180);
  if (!Array.isArray(packet.sources) || !packet.sources.length || packet.sources.length > MAX_SOURCES)
    throw new Error('Source count must be 1..6');
  if (!Array.isArray(packet.claims) || !packet.claims.length || packet.claims.length > MAX_CLAIMS)
    throw new Error('Claim count must be 1..30');
  const sourceIds = new Set(), claimIds = new Set(), urls = new Set();
  for (const s of packet.sources) {
    onlyKeys(s, ['id', 'url', 'sourceType'], 'source');
    const id = requireText(s.id, 'source id', 2, 30);
    if (!/^S[1-9][0-9]*$/.test(id) || sourceIds.has(id)) throw new Error('Duplicate or invalid source id');
    if (!['primary', 'official', 'review'].includes(s.sourceType)) throw new Error('Unknown source type');
    const url = safeSourceUrl(s.url);
    if (urls.has(url)) throw new Error('Duplicate source URL');
    sourceIds.add(id); urls.add(url);
  }
  for (const c of packet.claims) {
    onlyKeys(c, ['id', 'text', 'sourceId', 'evidenceQuote'], 'claim');
    const id = requireText(c.id, 'claim id', 2, 30);
    if (!/^C[1-9][0-9]*$/.test(id) || claimIds.has(id)) throw new Error('Duplicate or invalid claim id');
    requireText(c.text, 'claim text', 15, 450);
    requireText(c.evidenceQuote, 'evidence quote', 25, 500);
    if (!sourceIds.has(c.sourceId)) throw new Error('Claim references unknown source');
    claimIds.add(id);
  }
  return true;
}
function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x[0-9a-f]+|#[0-9]+);/gi, (entity) => {
    const key = entity.slice(1, -1).toLowerCase();
    const fixed = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ', '#39':"'"};
    if (key in fixed) return fixed[key];
    const n = key.startsWith('#x') ? parseInt(key.slice(2),16) : parseInt(key.slice(1),10);
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
  });
}
export function extractReadableText(body, mime) {
  if (!/^text\/(?:html|plain)\b/i.test(mime)) throw new Error('Unsupported source format');
  if (/(?:checking your browser|enable javascript and cookies to continue|verify you are human|captcha|access denied)/i.test(body.slice(0,9000)))
    throw new Error('Source blocked by access challenge');
  const text = /^text\/html/i.test(mime)
    ? body.replace(/<(?:script|style|noscript|svg|nav|footer)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|nav|footer)>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ')
    : body;
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}
function normalize(text) {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
function numbers(text) {
  return [...normalize(text).matchAll(/(?<![a-z0-9])\d+(?:[.,]\d+)?%?/g)].map(m => m[0]);
}
export async function downloadSource(url, {fetcher = fetch, timeoutMs = 12000} = {}) {
  let current = safeSourceUrl(url);
  for (let redirects = 0; redirects <= 2; redirects++) {
    const response = await fetcher(current, {
      method: 'GET', redirect: 'manual', credentials: 'omit',
      headers: {accept: 'text/html, text/plain;q=0.9', 'user-agent': 'YOS-JOURNAL-EvidenceAudit/0.1'},
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (!next || redirects === 2) throw new Error('Too many or invalid source redirects');
      current = safeSourceUrl(new URL(next, current).href);
      continue;
    }
    if (!response.ok) throw new Error('Source returned HTTP ' + response.status);
    const mime = response.headers.get('content-type') || '';
    if (!/^text\/(?:html|plain)\b/i.test(mime)) throw new Error('Unsupported source format');
    const len = Number(response.headers.get('content-length'));
    if (Number.isFinite(len) && len > MAX_BYTES) throw new Error('Source too large');
    if (!response.body) throw new Error('Empty source response');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let body = '', bytes = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new Error('Source too large');
        body += decoder.decode(value, {stream: true});
      }
      body += decoder.decode();
    } finally { await reader.cancel().catch(()=>{}); }
    const text = extractReadableText(body, mime);
    if (text.length < 100) throw new Error('Source body too short for reliable extraction');
    return {url: current, text, sha256: createHash('sha256').update(body).digest('hex')};
  }
  throw new Error('Source redirect failure');
}
export async function auditResearchPacket(packet, {fetcher = fetch, clock = () => new Date()} = {}) {
  validateResearchPacket(packet);
  const records = new Map();
  const sources = [];
  for (const s of packet.sources) {
    const result = {id:s.id, url:safeSourceUrl(s.url), sourceType:s.sourceType, status:'source_unavailable'};
    try {
      const downloaded = await downloadSource(s.url, {fetcher});
      records.set(s.id, downloaded);
      result.status='retrieved_not_fact_checked';
      result.url=downloaded.url;
      result.contentSha256=downloaded.sha256;
      result.extractedCharacters=downloaded.text.length;
    } catch (err) {
      result.status=String(err.message).includes('blocked')?'access_blocked':'source_unavailable';
      result.reason=String(err.message).slice(0,180);
    }
    sources.push(result);
  }
  const claims = packet.claims.map(c=>{
    const source = records.get(c.sourceId);
    const item = {id:c.id, text:c.text, sourceId:c.sourceId, status:'source_unavailable'};
    if (!source) return item;
    const quote = normalize(c.evidenceQuote);
    const extracted = normalize(source.text);
    if (!extracted.includes(quote)) {item.status='evidence_not_located';return item;}
    const missing = [...new Set(numbers(c.text))].filter(n=>!numbers(c.evidenceQuote).includes(n));
    if (missing.length) {item.status='numerical_evidence_gap';return item;}
    item.status='evidence_located_review_required';
    item.locatedExcerpt=c.evidenceQuote;
    item.sourceUrl=source.url;
    return item;
  });
  const handoff = [
    'YOS JOURNAL｜公開一次資料の取材ノート（出版不可・原典の意味照合待ち）',
    'テーマ：' + packet.topic,
    '出典の文章に一致した引用が見つかっても、研究内容や主張を検証したことにはならない。',
    '次の引用は執筆GPTの入力素材に限定する。原典の結果・研究対象・限界を独立して照合する。',
    ...claims.filter(c=>c.status==='evidence_located_review_required')
      .map(c=>c.id + ': 仮主張：' + c.text + '\n原文抜粋：' + c.locatedExcerpt + '\n出典：' + c.sourceUrl),
    ...claims.filter(c=>c.status!=='evidence_located_review_required')
      .map(c=>c.id + ': 未確認につき使用禁止（' + c.status + '）')
  ].join('\n\n');
  return {
    schemaVersion:1, kind:'research-evidence-audit', publicationAllowed:false,
    semanticFactCheck:'NOT_PERFORMED', checkedAt:clock().toISOString(),
    topic:packet.topic, sources, claims, handoffText:handoff,
    checks:{sourcesRetrieved:sources.filter(s=>s.status==='retrieved_not_fact_checked').length,
      evidenceLocated:claims.filter(c=>c.status==='evidence_located_review_required').length,
      verifiedClaims:0}
  };
}
async function main(argv) {
  const args = new Map();
  for (let i=0;i<argv.length;i+=2) {
    if (!['--input','--output','--notes'].includes(argv[i]) || !argv[i+1] || args.has(argv[i]))
      throw new Error('Usage: node journal/source-evidence-audit.mjs --input research.json --output audit.json [--notes handoff.txt]');
    args.set(argv[i],argv[i+1]);
  }
  if (!args.has('--input') || !args.has('--output')) throw new Error('Missing required input/output');
  const packet = JSON.parse(await readFile(args.get('--input'),'utf8'));
  const audit = await auditResearchPacket(packet);
  await writeFile(args.get('--output'),JSON.stringify(audit,null,2)+'\n',{flag:'wx',mode:0o600});
  if (args.has('--notes')) await writeFile(args.get('--notes'),audit.handoffText+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({publicationAllowed:false,sourcesRetrieved:audit.checks.sourcesRetrieved,
    evidenceLocated:audit.checks.evidenceLocated,verifiedClaims:0}));
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e=>{ console.error('Research audit stopped: '+e.message);process.exitCode=1; });
}
