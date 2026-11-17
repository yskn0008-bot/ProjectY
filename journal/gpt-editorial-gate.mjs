/**
 * GPT-prepared YOS JOURNAL candidates -> public reader issue.
 *
 * IMPORTANT: A passing structural check does NOT verify the underlying news.
 * The GPT editor must independently open the source and verify every material claim.
 * This module never accesses Notion, private context, paid models, or credentials.
 * It only checks *public-only* candidates intended for a PUBLIC GitHub repository.
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jstDate } from './daily-public-issue.mjs';

const DAY_MS = 86400000;
const ALLOWED_LANES = new Set(['ACTION', 'DIRECTION', 'DISCOVERY']);
const PRIVATE_MARKERS = [
  /(?:sk-proj-|sk-[A-Za-z0-9_-]{30,}|ntn_[A-Za-z0-9_-]+|Bearer\s+\S+|gh[pousr]_[A-Za-z0-9_]{16,})/i,
  /(?:口座番号|暗証番号|マイナンバー|カード番号|あなたの借入|あなたの残高|自分の残高|振込先口座)/i,
  /(?:ようすけ|陽介|YOS_NOTION_INTEGRATION_TOKEN|MY_WAY_WIDGET_TOKEN|個人のカレンダー|Notionタスク原文)/i,
  /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  /https?:\/\/(?:www\.)?(?:notion\.so|app\.notion\.com|drive\.google\.com|docs\.google\.com|calendar\.google\.com|chatgpt\.com)(?:\/|\b)/i,
];
const FORBIDDEN_HOSTS = /(?:^|\.)(?:localhost|local|internal|example|test|invalid|notion\.so|notion\.com|chatgpt\.com|githubusercontent\.com|github\.com|google\.com|icloud\.com)$/i;

function refuse(message) { throw new Error('GPT editorial gate refused: ' + message); }
function text(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) refuse('invalid ' + label);
  if (/[\u0000-\u001f\u007f]/.test(value)) refuse('control chars in ' + label);
  return value.trim();
}
function day(date) { if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; const d = new Date(date + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === date; }
function ageInDays(a, b) { return (Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY_MS; }
function httpsLink(link, label) {
  let u;
  try { u = new URL(text(link, label, 15, 1500)); } catch { refuse('invalid ' + label); }
  const hostname = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || u.hostname.endsWith('.') ||
      FORBIDDEN_HOSTS.test(hostname) || /^[\d.]+$/.test(hostname) || hostname.includes(':') || !hostname.includes('.')) refuse('unsafe source URL');
  if (/(?:token|secret|apikey|api_key|auth|credential|signature)=/i.test(u.search)) refuse('source URL appears credentialed');
  return u.href;
}
function allowKeys(obj, allowed, label) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) refuse('invalid ' + label);
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) refuse('unexpected field in ' + label + ': ' + k);
}
function publicSafety(candidate) {
  const raw = JSON.stringify(candidate);
  if (!raw || raw.length > 65000) refuse('candidate missing or too large');
  for (const p of PRIVATE_MARKERS) if (p.test(raw)) refuse('possible private content');
  return true;
}
export function validateCandidate(candidate, { now = new Date(), recent = [] } = {}) {
  publicSafety(candidate);
  allowKeys(candidate, ['schemaVersion', 'publicOnly', 'editorialKind', 'issue', 'verification'], 'candidate');
  if (candidate.schemaVersion !== 1 || candidate.publicOnly !== true || candidate.editorialKind !== 'gpt-source-reviewed') refuse('unsupported candidate contract');
  const issue = candidate.issue;
  allowKeys(issue, ['issuedOn', 'date', 'headline', 'lead', 'edition', 'articles'], 'issue');
  const today = jstDate(now);
  if (!day(issue.issuedOn) || issue.issuedOn !== today) refuse('issue not current JST date');
  text(issue.date, 'issue date label', 8, 70);
  text(issue.headline, 'cover headline', 12, 160);
  text(issue.lead, 'cover lead', 20, 500);
  text(issue.edition, 'edition', 4, 80);
  if (!Array.isArray(issue.articles) || issue.articles.length < 1 || issue.articles.length > 6) refuse('invalid article count');
  if (!Array.isArray(candidate.verification) || candidate.verification.length !== issue.articles.length) refuse('verification count mismatch');
  const links = new Set();
  const prior = new Set(recent.flatMap(x => x?.articles || []).map(x => x?.link).filter(Boolean));
  for (const [i, a] of issue.articles.entries()) {
    allowKeys(a, ['category', 'editorialLane', 'title', 'summary', 'reason', 'action', 'caveat', 'source', 'sourceDate', 'link', 'image', 'imageCaption', 'imageKind', 'keyPoints'], 'article');
    text(a.category, 'category', 4, 80);
    if (!ALLOWED_LANES.has(a.editorialLane)) refuse('invalid editorial lane');
    text(a.title, 'article title', 10, 160);
    text(a.summary, 'article summary', 45, 950);
    text(a.reason, 'generalized relevance', 20, 320);
    text(a.action, 'next step', 10, 300);
    text(a.caveat, 'caveat', 15, 420);
    text(a.source, 'source', 4, 150);
    text(a.sourceDate, 'source date label', 4, 90);
    const link = httpsLink(a.link, 'original source');
    if (links.has(link) || prior.has(link)) refuse('duplicate source URL in issue or recent editions');
    links.add(link);
    if (a.image !== '' || a.imageCaption !== '' || a.imageKind !== '') refuse('unlicensed image not allowed');
    if (!Array.isArray(a.keyPoints) || a.keyPoints.length > 3) refuse('too many key points');
    for (const item of a.keyPoints) text(item, 'key point', 3, 170);

    const review = candidate.verification[i];
    allowKeys(review, ['link', 'checkedOn', 'sourceType', 'sourceDateStatus', 'evidence', 'limitations', 'audienceMatch'], 'verification');
    if (httpsLink(review.link, 'verification source') !== link) refuse('source verification link mismatch');
    if (!day(review.checkedOn) || ageInDays(today, review.checkedOn) < 0 || ageInDays(today, review.checkedOn) > 2) refuse('source check outdated or in future');
    if (!['official', 'primary', 'editorial'].includes(review.sourceType)) refuse('unsupported source type');
    if (!['confirmed', 'unknown-disclosed', 'evergreen'].includes(review.sourceDateStatus)) refuse('source date must be classified');
    text(review.evidence, 'evidence description', 25, 450);
    text(review.limitations, 'scope/uncertainty', 10, 320);
    text(review.audienceMatch, 'why it matters', 20, 280);
    // The source is checked *by the GPT editor* via its browsing tools. A text
    // declaration is NOT independently verified by this local schema check.
  }
  return true;
}
export function publicIssue(candidate, options = {}) {
  validateCandidate(candidate, options);
  return structuredClone(candidate.issue); // Verification stays in review artifacts, not published JSON.
}
async function exists(path) { try { await access(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function prepareFiles(candidate, rootPath, { now = new Date() } = {}) {
  const root = resolve(rootPath);
  const latestPath = resolve(root, 'ios-app/scriptable/journal/latest.json');
  const datedPath = resolve(root, 'journal/editions', jstDate(now) + '.json');
  const scriptDatedPath = resolve(root, 'ios-app/scriptable/journal', jstDate(now) + '.json');
  if (await exists(datedPath) || await exists(scriptDatedPath)) refuse('dated edition already exists; never replace');
  let recent = [];
  let latest = null;
  try { latest = JSON.parse(await readFile(latestPath, 'utf8')); }
  catch (err) { if (err?.code !== 'ENOENT') refuse('existing latest cannot be read safely'); }
  if (latest && typeof latest === 'object') {
    if (latest.issuedOn > jstDate(now)) refuse('latest is newer than proposed issue');
    recent.push(latest);
  }
  for (let offset = 1; offset <= 7; offset++) {
    const d = new Date(now.getTime() - offset * DAY_MS);
    const p = resolve(root, 'journal/editions', jstDate(d) + '.json');
    try { recent.push(JSON.parse(await readFile(p, 'utf8'))); } catch (err) { if (err?.code !== 'ENOENT') refuse('previous issue cannot be read safely'); }
  }
  const issue = publicIssue(candidate, { now, recent });
  return { issue, paths: [datedPath, scriptDatedPath, latestPath], serialized: JSON.stringify(issue, null, 2) + '\n' };
}
export async function writePrepared(candidate, rootPath, { now = new Date(), approved = false } = {}) {
  if (!approved) refuse('explicit editorial review approval required');
  const result = await prepareFiles(candidate, rootPath, { now });
  await writeFile(result.paths[0], result.serialized, { flag: 'wx' });
  await writeFile(result.paths[1], result.serialized, { flag: 'wx' });
  await writeFile(result.paths[2], result.serialized);
  return result;
}
async function cli() {
  const args = process.argv.slice(2), fileIndex = args.indexOf('--candidate');
  if (fileIndex < 0 || !args[fileIndex + 1]) refuse('use --candidate <path>');
  const filename = resolve(args[fileIndex + 1]);
  const candidate = JSON.parse(await readFile(filename, 'utf8'));
  const rootIndex = args.indexOf('--root');
  const root = rootIndex >= 0 ? resolve(args[rootIndex + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const prepared = await prepareFiles(candidate, root);
  console.log('Candidate structurally valid: ' + prepared.issue.issuedOn + ', stories=' + prepared.issue.articles.length + '. Source fact-checking remains the GPT editor responsibility.');
  if (args.includes('--write')) {
    if (!args.includes('--approved-review')) refuse('publication requires --approved-review after checking original sources');
    await writePrepared(candidate, root, { approved: true });
    console.log('Wrote three issue files into working branch. Publishing still requires a reviewed GitHub PR.');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch(e => { console.error(e.message); process.exitCode = 1; });