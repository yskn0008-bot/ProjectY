'use strict';

const $ = (s) => document.querySelector(s);
const STORAGE_KEY = 'myway-shortcut-builder-v1';

const request = $('#request');
const resultCard = $('#resultCard');
const output = $('#output');
const resultTitle = $('#resultTitle');

const templates = {
  menu: '複数の機能を「メニューから選択」で1つにまとめたい',
  app: '選んだアプリを「アプリを開く」で起動したい',
  focus: '集中モードを切り替えてFlowを動かしたい',
  calendar: '次のカレンダー予定を取得して残り時間で分岐したい',
  place: '現在地の近くに特定の店舗がある時だけアプリを開きたい',
  notify: '条件に応じて「通知を表示」で知らせたい'
};

document.querySelectorAll('[data-template]').forEach((button) => {
  button.addEventListener('click', () => {
    request.value = templates[button.dataset.template] || '';
    request.focus();
  });
});

function contains(text, words) {
  return words.some((w) => text.includes(w));
}

function appNameFrom(text) {
  const known = ['Ponta', 'PayPay', 'Vポイント', 'ENEOS', 'Safari', '設定', 'ChatGPT', 'YouTube', 'Spotify'];
  return known.find((name) => text.toLowerCase().includes(name.toLowerCase())) || '開きたいアプリ';
}

function placeNameFrom(text) {
  const known = ['ローソン', 'ファミリーマート', 'ENEOS', 'セブン-イレブン', 'セブンイレブン'];
  return known.find((name) => text.includes(name)) || '判定したい店舗名';
}

function buildRecipe(text) {
  const t = text.trim();
  if (!t) return null;

  if (contains(t, ['ローソン', 'ファミリーマート', 'ENEOS', '店舗', '現在地', '近く'])) {
    const place = placeNameFrom(t);
    let app = appNameFrom(t);
    if (place === 'ローソン' && app === '開きたいアプリ') app = 'Ponta';
    if (place === 'ファミリーマート' && app === '開きたいアプリ') app = 'Vポイント';
    if (place === 'ENEOS' && app === '開きたいアプリ') app = 'ENEOS';
    return {
      title: `${place} → ${app}`,
      body: `【${place}の近くなら${app}を開く】\n\n「場所を検索」\n→ 検索する文字：${place}\n→ 場所：現在地\n\nその下に「If」\n→ 青い変数：「近くの店舗や企業」\n→ 条件：「任意の値」\n\nIfの中に\n「アプリを開く」\n→ ${app}\n\nその下に\n「このショートカットを停止」\n\n「その他の場合」\n→ 何も入れない\n\n「If文の終了」`
    };
  }

  if (contains(t, ['次の予定', 'カレンダー', '残り時間'])) {
    return {
      title: '次の予定を判定',
      body: `【次の予定を判定】\n\n「カレンダーの予定を検索」\n→ 開始日：次の未来の期間内\n→ 並び順序：開始日\n→ 順序：古い順\n→ 制限：オン\n→ 1項目\n\nその下に「If」\n→ カレンダーの予定\n→ 任意の値\n\nIfの中に\n「現在の日付」\n\nその下に\n「日付間の時間を取得」\n→ 現在の日付 と カレンダーの予定の開始日\n→ 単位：分\n\n必要な判定ごとに「If」\n→ 「通知を表示」\n\n最後の「その他の場合」\n→ 予定がない時の「通知を表示」\n\n「If文の終了」`
    };
  }

  if (contains(t, ['集中モード', 'Morning', 'Home Flow', 'Work Flow', 'Out Flow'])) {
    return {
      title: '集中モードを切り替える',
      body: `【集中モードを切り替える】\n\n「集中モードを設定」\n→ 使いたい集中モードを選ぶ\n→ オフ時まで\n→ オン\n\n集中モードをトリガーにする場合：\n「ショートカット」アプリ\n→「オートメーション」\n→右上「＋」\n→対象の「集中モード」\n→オンになったとき\n→実行したいFlowを選ぶ`
    };
  }

  if (contains(t, ['メニュー', '一覧', 'まとめ'])) {
    return {
      title: 'メニュー型ショートカット',
      body: `【メニュー型ショートカット】\n\n「メニューから選択」\n→ 必要な項目だけ追加\n\n各項目の直下に\n「アプリを開く」\nまたは\n実行したいアクションを追加\n\n使わない項目は作らない`
    };
  }

  if (contains(t, ['通知', '知らせ'])) {
    return {
      title: '通知を出す',
      body: `【通知を出す】\n\n必要な条件を「If」で作る\n\nIfの中に\n「通知を表示」\n→ 表示したい本文を入力\n\n「その他の場合」\n→ 必要な時だけ別の通知を追加\n\n「If文の終了」`
    };
  }

  const app = appNameFrom(t);
  return {
    title: `${app}を開く`,
    body: `【${app}を開く】\n\n「アプリを開く」\n→ ${app}\n\n必要なら、この前に\n「メニューから選択」\nまたは「If」を追加する`
  };
}

$('#build').addEventListener('click', () => {
  const recipe = buildRecipe(request.value);
  if (!recipe) {
    request.focus();
    return;
  }
  resultTitle.textContent = recipe.title;
  output.textContent = recipe.body;
  resultCard.hidden = false;
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(output.textContent || '');
  const b = $('#copy');
  const old = b.textContent;
  b.textContent = 'コピー済み';
  setTimeout(() => { b.textContent = old; }, 1200);
});

$('#openShortcuts').addEventListener('click', () => {
  window.location.href = 'shortcuts://create-shortcut';
});

function readSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function writeSaved(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 12)));
}

function renderSaved() {
  const host = $('#recentList');
  const items = readSaved();
  host.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'まだ保存した手順はありません。';
    host.append(p);
    return;
  }
  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.className = 'recentItem';
    button.innerHTML = `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.request)}</small>`;
    button.addEventListener('click', () => {
      request.value = item.request;
      resultTitle.textContent = item.title;
      output.textContent = item.body;
      resultCard.hidden = false;
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    host.append(button);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

$('#save').addEventListener('click', () => {
  const body = output.textContent || '';
  if (!body) return;
  const items = readSaved();
  items.unshift({
    title: resultTitle.textContent || '完成手順',
    request: request.value.trim(),
    body,
    savedAt: Date.now()
  });
  writeSaved(items);
  renderSaved();
});

$('#clear').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  renderSaved();
});

renderSaved();
