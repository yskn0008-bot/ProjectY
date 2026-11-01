import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';

// Read-only with respect to Inbox. This runs separately from the installed Clarity capture path.
const NOTION = 'https://api.notion.com/v1';
const VERSION = '2025-09-03';
const SOURCES = {
  task: {id: '965c6086-32c1-463d-93b4-87a9cb69b3ad', title: 'やること', key: '同期キー'},
  shopping: {id: 'd0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc', title: '商品名', key: 'メモ'},
  diary: {id: 'fe0e0973-d1cc-4bde-b138-1cb1da64ac68', title: '日記', key: '記録キー'},
  life: {id: '30df9a73-2ea7-4ff7-8187-2b62dc8f9da4', title: 'イベント名', key: '記録キー'}
} as const;
type Target = keyof typeof SOURCES;
type Capture = {id: string; at: string; source: string; raw: string};
type Decision = {target: Target; title: string; body?: string} | null;
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
    const match = /^(\d{4}-\d\d-\d\dT\S+)\s*·\s*([^·\n]+)\s*·\s*(clarity:[a-z\d_-]+)/iu.exec(line);
    if (!match || !match[1] || !match[2] || !match[3] || seen.has(match[3]) || /Notification|Email/iu.test(match[2])) continue;
    let raw = line.slice(match[0].length).trim();
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

export function createInboxSorter(options: {notionToken: string; inboxPageId: string; redis: RedisCommandClient; fetchImpl?: FetchLike}) {
  if (!options.notionToken || !/^[a-f0-9-]{32,36}$/iu.test(options.inboxPageId)) throw new Error('Inbox sorter configuration missing');
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
    const spec = SOURCES[decision.target], key = 'inbox:' + capture.id;
    const byKey = await unique(spec.id, {property: spec.key, rich_text: decision.target === 'shopping' ? {contains: key} : {equals: key}});
    if (byKey.length) {
      const existing = await api('/pages/' + byKey[0].id);
      if (plain(existing.properties?.[spec.key]?.rich_text).includes(key)) return 'duplicate';
      throw new Error('Existing key readback mismatch');
    }
    if ((await unique(spec.id, {property: spec.title, title: {equals: decision.title}})).length) throw new HoldCapture('Existing title; held');
    if (decision.target === 'diary' && (await unique(spec.id, {property: '日付', date: {equals: day(capture.at)}})).length) throw new HoldCapture('Existing diary day; held');
    const title = {title: rich(decision.title)}, ref = {rich_text: rich(key)};
    let properties: Record<string, unknown>;
    switch (decision.target) {
      case 'task': properties = {'やること': title, '同期キー': ref, '正本・根拠': {rich_text: rich('YOS Inbox ' + capture.id)}, '種類': {select: {name: 'Task'}}, '状態': {select: {name: '次にやる'}}}; break;
      case 'shopping': properties = {'商品名': title, 'メモ': {rich_text: rich(capture.raw + '\n' + key)}, '区分': {select: {name: '欲しいもの'}}, '買い物状態': {select: {name: '検討中'}}}; break;
      case 'diary': properties = {'日記': title, '本文': {rich_text: rich(decision.body ?? '')}, '日付': {date: {start: day(capture.at)}}, '記録元': {select: {name: 'Clarity'}}, '記録キー': ref}; break;
      case 'life': properties = {'イベント名': title, '備考': {rich_text: rich(capture.raw)}, '記録キー': ref, '取得元': {select: {name: 'Clarity'}}, '種類': {select: {name: 'その他'}}}; break;
    }
    const created = await api('/pages', 'POST', {parent: {type: 'data_source_id', data_source_id: spec.id}, properties});
    if (!created.id) throw new Error('Notion page ID missing; do not retry blindly');
    const saved = await api('/pages/' + created.id);
    if (!plain(saved.properties?.[spec.key]?.rich_text).includes(key)) throw new Error('Created key readback mismatch; do not retry blindly');
    return 'created';
  }
  return async function run(): Promise<{created: number; duplicates: number; held: number}> {
    const lock = 'yos:inbox-sorter:lock';
    if (await options.redis.command<string | null>(['SET', lock, 'processing', 'NX', 'EX', 120]) !== 'OK') throw new Error('Inbox sorter already running');
    let created = 0, duplicates = 0, held = 0;
    // The lock expires automatically. Destination keys, not the lock, protect retries.
    for (const capture of parseInbox(await blocks())) {
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
  };
}
