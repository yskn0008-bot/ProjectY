import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';

// Read-only with respect to Inbox. This runs separately from the installed Clarity capture path.
const NOTION = 'https://api.notion.com/v1';
const VERSION = '2025-09-03';
const ACCEPTANCE_ID = 'clarity:yos-test-20261101-0649';
const SOURCES = {
  task: {id: '965c6086-32c1-463d-93b4-87a9cb69b3ad', title: 'やること', key: '同期キー'},
  shopping: {id: 'd0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc', title: '商品名', key: 'メモ'},
  diary: {id: 'fe0e0973-d1cc-4bde-b138-1cb1da64ac68', title: '日記', key: '記録キー'},
  life: {id: '30df9a73-2ea7-4ff7-8187-2b62dc8f9da4', title: 'イベント名', key: '記録キー'},
  money: {id: '95b30d16-7530-40c6-a320-dab99acad55d', title: '項目', key: '原本ID'}
} as const;
type Target = keyof typeof SOURCES | 'page';
type Capture = {id: string; at: string; source: string; raw: string};
type Decision = {target: Exclude<Target, 'page'>; title: string; body?: string; amount?: number; merchant?: string; transactionId?: string} |
  {target: 'page'; title: string; body: string} | null;
type Rich = {type: 'text'; text: {content: string}};
type Block = {id: string; type: string; paragraph?: {rich_text?: Array<{plain_text?: string; text?: {content?: string}}>} };
class HoldCapture extends Error {}

function rich(value: string): Rich[] {
  const chars = Array.from(value), out: Rich[] = [];
  for (let i = 0; i < chars.length; i += 1800) out.push({type: 'text', text: {content: chars.slice(i, i + 1800).join('')}});
  return out;
}
function plain(items: Array<{plain_text?: string; text?: {content?: string}}> | undefined): string {
  return (items ?? []).map(x => x.plain_text ?? x.text?.content ?? '').join('');
}
function day(iso: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(+date)) return null;
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);
}

export function parseInbox(blocks: Block[]): Capture[] {
  const captures: Capture[] = [], seen = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block?.type !== 'paragraph') continue;
    const line = plain(block.paragraph?.rich_text);
    const match = /^(\d{4}-\d\d-\d\dT\S+)\s*·\s*([^·\n]+)\s*·\s*((?:clarity|notification|share):[a-z\d._:-]+)/iu.exec(line);
    if (!match || !match[1] || !match[2] || !match[3] || seen.has(match[3]) || !/^(?:Memo|Clarity|Clarity Voice|Clarity Text|Clarity\.Voice|Clarity\.Text|clarity\/voice|clarity\/text|Clarity Notification|Clarity Share)$/iu.test(match[2].trim())) continue;
    const source = match[2].trim();
    if ((source === 'Clarity Notification' && !match[3].startsWith('notification:')) ||
        (source === 'Clarity Share' && !match[3].startsWith('share:')) ||
        (source !== 'Clarity Notification' && source !== 'Clarity Share' && !match[3].startsWith('clarity:'))) continue;
    let raw = line.slice(match[0].length).trim();
    if (/^·\s*(?:information|money-review|missed-call|legal|security)$/iu.test(raw)) raw = '';
    if (!raw) for (let j = i + 1; j < Math.min(blocks.length, i + 5); j++) {
      const next = blocks[j];
      if (next?.type !== 'paragraph') break;
      const candidate = plain(next.paragraph?.rich_text).trim();
      if (!candidate) continue;
      if (candidate === '---' || /^\d{4}-\d\d-\d\dT\S+\s*·/u.test(candidate)) break;
      raw = candidate; break;
    }
    if (!raw || raw === '---' || raw.length > 12000) continue;
    seen.add(match[3]);
    captures.push({id: match[3], at: match[1], source: match[2].trim(), raw});
  }
  return captures;
}

export function decide(capture: Capture): Decision {
  const text = capture.raw.trim().normalize('NFKC');
  const source = capture.source.trim();
  // Notifications are data, never actionable instructions.
  if (source === 'Clarity Notification') {
    const normalized = text.replace(/<br\s*\/?\s*>/giu, '\n').replace(/&nbsp;/giu, ' ');
    if (!/PayPay/u.test(normalized) || !/取引が完了しました/u.test(normalized) ||
        /(?:出金|チャージ|送金|受け取り|取消|返金|失敗|受付)/u.test(normalized)) return null;
    const money = /金額[：:]\s*([\d,]+)円/u.exec(normalized);
    const merchant = /店舗名[：:]\s*([^\n]+)/u.exec(normalized);
    const transaction = /取引番号[：:]\s*([0-9]{8,32})(?:\s|$)/u.exec(normalized);
    const amount = Number(money?.[1]?.replaceAll(',', ''));
    if (!money || !merchant || !transaction || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000 ||
        !day(capture.at)) return null;
    const shop = (merchant[1] ?? '').trim().slice(0, 90);
    if (!shop || /(?:非表示|不明|未確認)/u.test(shop)) return null;
    return {target: 'money', title: shop, amount, merchant: shop, transactionId: transaction[1] ?? ''};
  }
  // Share content cannot issue Notion writes.
  if (source === 'Clarity Share' || !/^(?:Memo|Clarity|Clarity Voice|Clarity Text|Clarity\.Voice|Clarity\.Text|clarity\/voice|clarity\/text)$/iu.test(source) ||
      !capture.id.startsWith('clarity:')) return null;
  // Exact page name only; arbitrary guesses are held.
  const namedPage = /^Notion[のに]?[「『]([^」』]{1,100})[」』]に(?:記録|保存|追記)[：:\s]+([\s\S]{1,1800})$/iu.exec(text);
  if (namedPage && namedPage[1] && namedPage[2] && namedPage[1].trim() !== 'YOS Inbox') {
    return {target: 'page', title: namedPage[1].trim(), body: namedPage[2].trim()};
  }
  if (!day(capture.at) || !text || text.length > 1800 || /[?？]/u.test(text) ||
      /^(もし|仮に|相談|質問|調べて|比較して)/u.test(text) || /Share/iu.test(capture.source) ||
      /(?:残高|支払|入金|出金|返済|円|PayPay|銀行)/iu.test(text) || /^(?:Life Log|通知)に/u.test(text)) return null;
  let match = /^生活記録に[：:\s]*(.+?)を(?:記録|保存)して[。！!]?$/u.exec(text);
  if (match?.[1]?.trim() && !/(?:明日|来週|予定|つもり)/u.test(match[1])) return {target: 'life', title: match[1].trim()};
  match = /^(?:タスク|やること)(?:に)?[：:]\s*(.+)$/u.exec(text) || /^(.+?)を(?:タスク|やること)に(?:登録|追加|入れて)(?:して)?[。！!]?$/u.exec(text);
  if (match?.[1]?.trim() && !/(?:明日|来週|今日|\d{1,2}時|\d{1,2}日)/u.test(match[1])) return {target: 'task', title: match[1].trim()};
  match = /^(.+?)を(?:欲しいもの|買い物リスト)に(?:登録|追加|入れて)(?:して)?[。！!]?$/u.exec(text);
  if (match?.[1]?.trim()) return {target: 'shopping', title: match[1].trim()};
  match = /^(?:日記に|日記[：:])\s*(.+?)(?:を(?:記録|保存)して)?[。！!]?$/u.exec(text);
  if (match?.[1]?.trim()) return {target: 'diary', title: day(capture.at) + '｜Clarity', body: match[1].trim()};
  return null;
}

export function createInboxSorter(options: {notionToken: string; inboxPageId: string; redis: RedisCommandClient; mode?: 'test' | 'run'; captureId?: string; fetchImpl?: FetchLike}) {
  if (!options.notionToken || !/^[a-f0-9-]{32,36}$/iu.test(options.inboxPageId)) throw new Error('Inbox sorter configuration missing');
  const mode = options.mode ?? 'test';
  if (mode !== 'test' && mode !== 'run') throw new Error('Invalid Inbox sorter mode');
  const fetchImpl = options.fetchImpl ?? fetch;
  async function api(path: string, method = 'GET', body?: unknown): Promise<Record<string, any>> {
    const response = await fetchImpl(NOTION + path, {method, headers: {
      Authorization: `Bearer ${options.notionToken}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json'
    }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    if (!response.ok) throw new Error('Notion request failed: ' + response.status);
    return await response.json() as Record<string, any>;
  }
  async function blocks(): Promise<Block[]> {
    const all: Block[] = []; let cursor: string | null = null;
    for (let i = 0; i < 50; i++) {
      const result = await api('/blocks/' + options.inboxPageId + '/children?page_size=100' + (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''));
      all.push(...(result.results ?? []));
      if (!result.has_more) return all;
      if (!result.next_cursor || result.next_cursor === cursor) throw new Error('Inbox cursor invalid');
      cursor = result.next_cursor as string;
    }
    throw new Error('Inbox too large; no writes');
  }
  async function unique(id: string, filter: unknown): Promise<any[]> {
    const result = await api('/data_sources/' + id + '/query', 'POST', {filter, page_size: 2});
    if (result.has_more || result.results?.length > 1) throw new HoldCapture('Ambiguous destination match');
    return result.results ?? [];
  }
  async function write(capture: Capture, decision: NonNullable<Decision>): Promise<'created' | 'duplicate'> {
    if (decision.target === 'page') return writeToPage(capture, decision);
    const spec = SOURCES[decision.target], key = 'inbox:' + capture.id;
    const byKey = await unique(spec.id, {property: spec.key, rich_text: decision.target === 'shopping' ? {contains: key} : {equals: key}});
    if (byKey.length) {
      const existing = await api('/pages/' + byKey[0].id);
      if ((decision.target === 'shopping' ? plain(existing.properties?.[spec.key]?.rich_text).split(/\r?\n/u).includes(key) : plain(existing.properties?.[spec.key]?.rich_text) === key)) return 'duplicate';
      throw new Error('Existing key readback mismatch');
    }
    if (decision.target === 'money') {
      if (!decision.transactionId || !decision.amount || !decision.merchant) throw new HoldCapture('Unverified transaction');
      if ((await unique(spec.id, {property: spec.key, rich_text: {equals: decision.transactionId}})).length) throw new HoldCapture('Already imported by official ID');
      const candidates = await api('/data_sources/' + spec.id + '/query', 'POST', {filter: {and: [
        {property: '日付', date: {equals: day(capture.at)}},
        {property: '金額', number: {equals: decision.amount}}
      ]}, page_size: 2});
      if (candidates.has_more || (candidates.results ?? []).length) throw new HoldCapture('Possible existing transaction');
    } else if ((await unique(spec.id, {property: spec.title, title: {equals: decision.title}})).length) {
      throw new HoldCapture('Existing title; held');
    }
    if (decision.target === 'diary' && (await unique(spec.id, {property: '日付', date: {equals: day(capture.at)}})).length) throw new HoldCapture('Existing diary day; held');
    const title = {title: rich(decision.title)}, ref = {rich_text: rich(key)};
    let properties: Record<string, unknown>;
    switch (decision.target) {
      case 'task': properties = {'やること': title, '同期キー': ref, '正本・根拠': {rich_text: rich('YOS Inbox ' + capture.id)}, '種類': {select: {name: 'Task'}}, '状態': {select: {name: '次にやる'}}}; break;
      case 'shopping': properties = {'商品名': title, 'メモ': {rich_text: rich(capture.raw + '\n' + key)}, '区分': {select: {name: '欲しいもの'}}, '買い物状態': {select: {name: '検討中'}}}; break;
      case 'diary': properties = {'日記': title, '本文': {rich_text: rich(decision.body ?? '')}, '日付': {date: {start: day(capture.at)}}, '記録元': {select: {name: 'Clarity'}}, '記録キー': ref}; break;
      case 'life': properties = {'イベント名': title, '備考': {rich_text: rich(capture.raw)}, '記録キー': ref, '取得元': {select: {name: 'Clarity'}}, '種類': {select: {name: 'その他'}}}; break;
      case 'money':
        properties = {'項目': title, '原本ID': ref, '日付': {date: {start: day(capture.at)}},
          '金額': {number: decision.amount}, '区分': {select: {name: '支出'}},
          '分類': {select: {name: 'その他'}}, '状態': {select: {name: '実績'}},
          '確度': {select: {name: '未確認'}}, '確認元': {rich_text: rich('PayPay決済完了通知（公式明細未照合）')},
          '支払元': {rich_text: rich('PayPay')}, 'メモ': {rich_text: rich('通知元ID=' + capture.id + '; 取引番号=' + decision.transactionId + '; 正式明細との照合待ち。通知だけで残高は更新しない。')}};
        break;
    }
    const created = await api('/pages', 'POST', {parent: {type: 'data_source_id', data_source_id: spec.id}, properties});
    if (!created.id) throw new Error('Notion page ID missing; do not retry blindly');
    const saved = await api('/pages/' + created.id);
    if (!(decision.target === 'shopping' ? plain(saved.properties?.[spec.key]?.rich_text).split(/\r?\n/u).includes(key) : plain(saved.properties?.[spec.key]?.rich_text) === key)) throw new Error('Created key readback mismatch; do not retry blindly');
    return 'created';
  }
  async function writeToPage(capture: Capture, decision: {target: 'page'; title: string; body: string}): Promise<'created' | 'duplicate'> {
    const search = await api('/search', 'POST', {query: decision.title, filter: {property: 'object', value: 'page'}, page_size: 100});
    if (search.has_more) throw new HoldCapture('Ambiguous page search');
    const matches = (search.results ?? []).filter((page: any) => {
      if (page.object !== 'page' || page.archived || page.in_trash || !page.id) return false;
      const titles = page.properties ? Object.values(page.properties).filter((p: any) => p?.type === 'title') : [];
      return titles.some((p: any) => plain(p.title) === decision.title);
    });
    if (matches.length !== 1 || matches[0].id === options.inboxPageId) throw new HoldCapture('Page title not unique or inaccessible');
    const pageId = matches[0].id as string, key = 'inbox:' + capture.id;
    async function hasReceipt(): Promise<boolean> {
      let cursor: string | null = null;
      for (let i = 0; i < 30; i++) {
        const result = await api('/blocks/' + pageId + '/children?page_size=100' +
          (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''));
        if ((result.results ?? []).some((b: Block) => b.type === 'paragraph' && plain(b.paragraph?.rich_text).startsWith('[YOS Inbox ' + key + ']'))) return true;
        if (!result.has_more) return false;
        if (!result.next_cursor || result.next_cursor === cursor) throw new HoldCapture('Page receipt scan incomplete');
        cursor = result.next_cursor;
      }
      throw new HoldCapture('Page too long for safe deduplication');
    }
    if (await hasReceipt()) return 'duplicate';
    const block = {object: 'block', type: 'paragraph', paragraph: {rich_text: rich('[YOS Inbox ' + key + '] ' + decision.body)}};
    await api('/blocks/' + pageId + '/children', 'PATCH', {children: [block]});
    if (!await hasReceipt()) throw new Error('Page append readback missing; do not retry blindly');
    return 'created';
  }
  return async function run(): Promise<{created: number; duplicates: number; held: number}> {
    const lock = 'yos:inbox-sorter:lock', owner = crypto.randomUUID();
    if (await options.redis.command<string | null>(['SET', lock, owner, 'NX', 'EX', 120]) !== 'OK') throw new Error('Inbox sorter already running');
    try {
      let created = 0, duplicates = 0, held = 0;
      const all = parseInbox(await blocks());
      const selected = options.captureId ? all.filter(capture => capture.id === options.captureId) :
        mode === 'test' ? all.filter(capture => capture.id === ACCEPTANCE_ID) : all;
      if (mode === 'test' && !options.captureId && selected.length !== 1) throw new Error('Acceptance capture missing; no writes');
      if (options.captureId && selected.length !== 1) throw new Error('Capture not found or ambiguous; no writes');
      for (const capture of selected) {
        const decision = decide(capture);
        if (!decision) {held++; continue;}
        try {
          const result = await write(capture, decision);
          if (result === 'created') created++; else duplicates++;
        } catch (error) {
          if (!(error instanceof HoldCapture)) throw error;
          held++;
        }
        if (created >= 10) break;
      }
      return {created, duplicates, held};
    } finally {
      // Do not release another process's lock if the TTL has already expired.
      if (await options.redis.command<string | null>(['GET', lock]) === owner) {
        await options.redis.command<number>(['DEL', lock]);
      }
    }
  };
}
