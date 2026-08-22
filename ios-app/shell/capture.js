import { NativeCaptureClient } from './capture-core.js';

const client = new NativeCaptureClient();
const form = document.querySelector('#capture-form');
const text = document.querySelector('#capture-text');
const submit = document.querySelector('#capture-submit');
const status = document.querySelector('#capture-status');
const historyList = document.querySelector('#capture-history');

function report(message, success = false) {
  status.textContent = message;
  status.dataset.success = String(success);
}

function render(records) {
  historyList.replaceChildren(...records.map(record => {
    const item = document.createElement('li');
    const body = document.createElement('p');
    const meta = document.createElement('small');
    body.textContent = record.rawText;
    meta.textContent = record.status === 'needs_review' ? '未整理のまま安全に保存済み' : '保存済み';
    item.append(body, meta);
    return item;
  }));
}

async function refresh() {
  const result = await client.list(20);
  render(result.records || []);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  report('保存しています…');
  try {
    await client.capture(text.value, 'text');
    text.value = '';
    report('保存しました', true);
    await refresh();
    setTimeout(() => {
      if (document.referrer && window.history.length > 1) window.history.back();
    }, 650);
  } catch (error) {
    report(error?.message || '保存できませんでした。', false);
  } finally {
    submit.disabled = false;
  }
});

requestAnimationFrame(() => text.focus({ preventScroll: true }));
refresh();
