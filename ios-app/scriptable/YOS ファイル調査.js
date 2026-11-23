// Variables used by Scriptable.
// icon-color: gray; icon-glyph: folder;
// YOS_SCRIPT_NAME: YOS ファイル調査
// YOS File Audit v1 — read-only; no network, upload, content reads or mutation.
// A user-granted iCloud Drive folder is required. Siri can reuse a bookmark
// created by Scriptable's "Create File Bookmark" Shortcuts action.

const BOOKMARK = 'YOS Files Root';
const MAX_ITEMS = 2500;
const MAX_DEPTH = 12;
const MAX_REPORT = 70000;

function readableError(error) {
  return String((error && error.message) || error).slice(0, 180);
}
function cleanName(name) {
  return String(name).replace(/[\r\n\t]/g, ' ').slice(0, 220);
}
function fileKind(name) {
  const match = String(name).match(/\.([a-z0-9]{1,10})$/i);
  return match ? match[1].toLowerCase() : '(拡張子なし)';
}
function sizeLabel(kb) {
  if (typeof kb !== 'number' || !isFinite(kb) || kb < 0) return 'サイズ不明';
  if (kb >= 1024) return (kb / 1024).toFixed(1) + 'MB';
  return Math.round(kb) + 'KB';
}
function reportText(rootName, stats, entries, errors) {
  const types = Object.keys(stats.types)
    .sort((a, b) => stats.types[b] - stats.types[a])
    .slice(0, 12)
    .map(k => k + ':' + stats.types[k])
    .join(' / ');
  const duplicates = {};
  for (const e of entries) {
    if (e.folder || e.sizeKB === null) continue;
    const key = e.name.toLowerCase() + '|' + e.sizeKB;
    if (!duplicates[key]) duplicates[key] = [];
    duplicates[key].push(e.path);
  }
  const candidates = Object.keys(duplicates)
    .filter(key => duplicates[key].length > 1)
    .slice(0, 15)
    .map(key => '  ? ' + duplicates[key].join(' / '));
  const protectedNames = /(^|\/)(Shortcuts|Scriptable|YOS|乗務記録)(\/|$)/i;
  const protectedEntries = entries
    .filter(e => e.folder && protectedNames.test(e.path))
    .slice(0, 15)
    .map(e => '  - ' + e.path);
  const lines = [
    'YOS ファイル調査｜読み取り専用レポート',
    '取得日時: ' + new Date().toLocaleString('ja-JP'),
    '調査対象: ' + rootName,
    'フォルダ: ' + stats.folders + ' / ファイル: ' + stats.files,
    '拡張子内訳: ' + (types || 'なし'),
    '取得範囲: ' + (stats.truncated ? '一部（安全上限に到達）' : '指定フォルダ内を走査'),
    'アクセスできなかった場所: ' + errors.length,
    '',
    '【保護する候補】',
    protectedEntries.join('\n') || '  該当なし',
    '',
    '【重複の可能性（名前と容量が同じだけ／削除根拠ではない）】',
    candidates.join('\n') || '  該当なし',
    '',
    '【フォルダ・ファイル一覧（相対パス｜容量）】'
  ];
  for (const e of entries) {
    const row = (e.folder ? '[フォルダ] ' : '[ファイル] ')
      + e.path + (e.folder ? '' : '｜' + sizeLabel(e.sizeKB));
    if (lines.join('\n').length + row.length > MAX_REPORT - 1200) {
      lines.push('…レポート文字数の上限に到達。残りは記載していません。');
      stats.reportCut = true;
      break;
    }
    lines.push(row);
  }
  if (errors.length) {
    lines.push('', '【取得エラー】');
    for (const e of errors.slice(0, 20)) lines.push('  - ' + e);
  }
  lines.push('', '注意：名前と容量しか取得していません。内容や同一性は未確認です。');
  lines.push('このレポートをChatGPTに共有して整理案を作成できます。');
  lines.push('調査により元ファイルを移動・削除・変更していません。');
  return lines.join('\n');
}

async function selectFolder() {
  const sources = [FileManager.iCloud(), FileManager.local()];
  for (const fm of sources) {
    try {
      if (!fm.bookmarkExists(BOOKMARK)) continue;
      const p = fm.bookmarkedPath(BOOKMARK);
      if (p && fm.isDirectory(p)) {
        fm.listContents(p); // Ensure the bookmark actually grants directory access.
        return { fm: fm, path: p, label: BOOKMARK + '（登録済み）' };
      }
    } catch (e) { /* Try the second manager and then interactive choice. */ }
  }
  // A bookmark created in Scriptable settings does NOT work from Siri.
  // Do not attempt a picker from a headless shortcut run.
  if (!config.runsInApp) {
    throw new Error('最初はScriptableアプリから「YOS ファイル調査」を開いてフォルダを選択してください。Siriで毎回自動化する場合は、ショートカットのScriptable「Create File Bookmark」で名前「' + BOOKMARK + '」の許可を作成してください。');
  }
  const prompt = new Alert();
  prompt.title = 'YOS ファイル調査';
  prompt.message = '調査したいiCloud Driveのフォルダを1つ選んでください。中のファイルは変更しません。';
  prompt.addAction('フォルダを選ぶ');
  prompt.addCancelAction('中止');
  if (await prompt.presentAlert() < 0) return null;
  const picked = await DocumentPicker.openFolder();
  if (!picked || typeof picked !== 'string') return null;
  for (const fm of sources) {
    try {
      if (fm.isDirectory(picked)) {
        fm.listContents(picked);
        const basename = picked.split('/').filter(Boolean).pop() || '選択フォルダ';
        return { fm: fm, path: picked, label: basename };
      }
    } catch (e) { /* Another provider may own this folder. */ }
  }
  throw new Error('選択されたフォルダをScriptableから読めません。別のiCloud Driveフォルダを選択してください。');
}

function scanFolder(fm, root) {
  const stats = { files: 0, folders: 0, types: {}, truncated: false, reportCut: false };
  const entries = [], errors = [], queue = [{ full: root, relative: '', depth: 0 }];
  while (queue.length) {
    if (entries.length >= MAX_ITEMS) { stats.truncated = true; break; }
    const current = queue.shift();
    let names;
    try { names = fm.listContents(current.full).sort((a,b) => a.localeCompare(b, 'ja')); }
    catch (e) {
      errors.push((current.relative || '.') + ': ' + readableError(e));
      continue;
    }
    for (const name of names) {
      if (entries.length >= MAX_ITEMS) { stats.truncated = true; break; }
      const full = fm.joinPath(current.full, name);
      const relative = current.relative ? current.relative + '/' + cleanName(name) : cleanName(name);
      try {
        const folder = fm.isDirectory(full);
        let sizeKB = null;
        if (!folder) {
          try {
            const n = fm.fileSize(full);
            if (typeof n === 'number' && isFinite(n) && n >= 0) sizeKB = n;
          } catch (ignored) {}
        }
        entries.push({ name: cleanName(name), path: relative, folder: folder, sizeKB: sizeKB });
        if (folder) {
          stats.folders++;
          if (current.depth < MAX_DEPTH) {
            queue.push({ full: full, relative: relative, depth: current.depth + 1 });
          } else {
            stats.truncated = true;
          }
        } else {
          stats.files++;
          const kind = fileKind(name);
          stats.types[kind] = (stats.types[kind] || 0) + 1;
        }
      } catch (e) {
        errors.push(relative + ': ' + readableError(e));
      }
    }
  }
  return { stats: stats, entries: entries, errors: errors };
}

async function main() {
  const choice = await selectFolder();
  if (!choice) return;
  const scan = scanFolder(choice.fm, choice.path);
  const text = reportText(choice.label, scan.stats, scan.entries, scan.errors);
  Script.setShortcutOutput(text);
  if (!config.runsInApp) return;
  const dialog = new Alert();
  dialog.title = '調査結果';
  dialog.message = scan.stats.folders + 'フォルダ / ' + scan.stats.files + 'ファイルを確認。'
    + (scan.stats.truncated ? '\n全件ではありません。' : '')
    + '\nファイルは変更していません。';
  dialog.addAction('ChatGPTへ共有');
  dialog.addAction('結果をコピー');
  dialog.addAction('内容を表示');
  dialog.addCancelAction('閉じる');
  const action = await dialog.presentAlert();
  if (action === 0) await ShareSheet.present([text]);
  else if (action === 1) Pasteboard.copyString(text);
  else if (action === 2) await QuickLook.present(text);
}
try {
  await main();
} catch (error) {
  const message = 'YOS ファイル調査：中止（元ファイル変更なし）\n' + readableError(error);
  Script.setShortcutOutput(message);
  if (config.runsInApp) {
    const alert = new Alert(); alert.title = '調査できませんでした';
    alert.message = message; alert.addAction('閉じる'); await alert.presentAlert();
  }
} finally {
  Script.complete();
}
