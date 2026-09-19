// Money Bridge
// Internal executor adapter only. Normal user input must originate in Clarity.
// Bootstraps the existing Money Capture core into a unique submodule path to avoid Scriptable name collisions.

const fm = FileManager.iCloud();
const ROOT = fm.joinPath(fm.documentsDirectory(), 'YOS Money');
const BACKUP_DIR = fm.joinPath(ROOT, '_backups');
const DATA_PATH = fm.joinPath(ROOT, 'transactions.json');
const CSV_PATH = fm.joinPath(ROOT, 'transactions.csv');
const MODULE_DIR = fm.joinPath(fm.documentsDirectory(), 'one-enter-money');
const MODULE_FILE = 'MoneyCaptureCore_20260917_p01.js';
const MODULE_PATH = fm.joinPath(MODULE_DIR, MODULE_FILE);
const MODULE_NAME = 'one-enter-money/MoneyCaptureCore_20260917_p01';
const CORE_URL = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/2be439af2259dc699e11438ff831f33b27b3d20e/prototypes/money-capture-scriptable/YOS%20Money%20Capture.js';
const SCHEMA_VERSION = 'yos-money-capture-p0-v1';

async function ensureCoreModule() {
  if (!fm.fileExists(MODULE_DIR)) fm.createDirectory(MODULE_DIR, true);

  let valid = false;
  if (fm.fileExists(MODULE_PATH)) {
    try {
      await fm.downloadFileFromiCloud(MODULE_PATH);
      const existing = fm.readString(MODULE_PATH);
      valid = !!existing && existing.includes('module.exports={parseJapaneseNumberToken');
    } catch (_) {}
  }

  if (!valid) {
    const req = new Request(`${CORE_URL}?v=20260917p01`);
    req.headers = { 'Cache-Control': 'no-cache' };
    const source = await req.loadString();

    if (!source || !source.includes('module.exports={parseJapaneseNumberToken')) {
      throw new Error('Money Capture core download/validation failed');
    }

    fm.writeString(MODULE_PATH, source);
    try { await fm.downloadFileFromiCloud(MODULE_PATH); } catch (_) {}
  }
}

async function loadCore() {
  await ensureCoreModule();
  const core = importModule(MODULE_NAME);

  if (
    !core ||
    typeof core.parseMoneyInput !== 'function' ||
    typeof core.isDuplicate !== 'function' ||
    typeof core.toTransaction !== 'function' ||
    typeof core.feedback !== 'function'
  ) {
    throw new Error('Money Capture core exports unavailable');
  }

  return core;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function ensureDownloaded(path) {
  if (!fm.fileExists(path)) return;
  try { await fm.downloadFileFromiCloud(path); } catch (_) {}
}

async function loadStore() {
  if (!fm.fileExists(ROOT)) fm.createDirectory(ROOT, true);
  if (!fm.fileExists(BACKUP_DIR)) fm.createDirectory(BACKUP_DIR, true);
  await ensureDownloaded(DATA_PATH);

  if (!fm.fileExists(DATA_PATH)) {
    return { schema_version: SCHEMA_VERSION, updated_at: null, transactions: [] };
  }

  const parsed = JSON.parse(fm.readString(DATA_PATH));
  if (!Array.isArray(parsed.transactions)) throw new Error('invalid_transactions_store');
  return parsed;
}

function writeCsv(transactions) {
  const header = ['id','type','amount','category','date','merchant','memo','source','created_at','updated_at','raw_input'];
  const rows = [header.join(',')];
  for (const tx of transactions) rows.push(header.map(k => csvEscape(tx[k])).join(','));
  fm.writeString(CSV_PATH, rows.join('\n'));
}

function pruneBackups() {
  const files = fm.listContents(BACKUP_DIR).filter(x => x.endsWith('.json')).sort();
  while (files.length > 14) fm.remove(fm.joinPath(BACKUP_DIR, files.shift()));
}

async function saveStore(store) {
  const now = new Date();

  if (fm.fileExists(DATA_PATH)) {
    await ensureDownloaded(DATA_PATH);
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    fm.copy(DATA_PATH, fm.joinPath(BACKUP_DIR, `${stamp}.json`));
  }

  const next = { ...store, schema_version: SCHEMA_VERSION, updated_at: now.toISOString() };
  fm.writeString(DATA_PATH, JSON.stringify(next, null, 2));
  writeCsv(next.transactions);
  pruneBackups();
  return next;
}

function callbackPayload(status, verified, result = {}, errorCode = '') {
  return {
    status,
    verified: verified ? 'true' : 'false',
    result: JSON.stringify(result),
    error_code: errorCode || ''
  };
}

function appendQuery(base, params) {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ''))}`)
    .join('&');
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

async function maybeShowDebug(payload) {
  const qp = args.queryParameters || {};
  if (qp.debug !== '1') return;

  const a = new Alert();
  a.title = `Money Bridge: ${payload.status}`;
  a.message = `${payload.error_code || 'ok'}\n${payload.result || ''}`;
  a.addAction('OK');
  await a.presentAlert();
}

async function finish(payload) {
  await maybeShowDebug(payload);

  const qp = args.queryParameters || {};
  const success = qp['x-success'];

  if (success) {
    Safari.open(appendQuery(success, payload));
    Script.complete();
    return;
  }

  Script.setShortcutOutput(payload);
  Script.complete();
}

try {
  const core = await loadCore();
  const qp = args.queryParameters || {};
  const rawInput = String(qp.text || '').trim();

  if (!rawInput) {
    await finish(
      callbackPayload(
        'blocked',
        false,
        { message: '入力内容がありません', missing: ['raw_input'] },
        'missing_raw_input'
      )
    );
  } else {
    let store = await loadStore();
    const candidate = core.parseMoneyInput(rawInput, new Date());

    if (!candidate.can_save) {
      await finish(
        callbackPayload(
          'blocked',
          false,
          {
            message: `未保存｜${candidate.missing.join(',')}の確認が必要です`,
            missing: candidate.missing,
            raw_input: rawInput
          },
          'missing_required_info'
        )
      );
    } else {
      const now = new Date();

      if (core.isDuplicate(store.transactions, candidate, now.toISOString())) {
        await finish(
          callbackPayload(
            'success',
            true,
            {
              message: '同じ内容が直前に記録済みです',
              duplicate: true,
              raw_input: rawInput
            },
            ''
          )
        );
      } else {
        const tx = core.toTransaction(candidate, 'clarity', now);
        store.transactions.push(tx);
        await saveStore(store);

        await finish(
          callbackPayload(
            'success',
            true,
            {
              message: core.feedback(tx),
              duplicate: false,
              transaction_id: tx.id,
              type: tx.type,
              amount: tx.amount,
              category: tx.category,
              date: tx.date,
              merchant: tx.merchant,
              raw_input: tx.raw_input
            },
            ''
          )
        );
      }
    }
  }
} catch (err) {
  await finish(
    callbackPayload(
      'failed',
      false,
      { message: `Money Bridge エラー：${err?.message || String(err)}` },
      'money_bridge_error'
    )
  );
}
