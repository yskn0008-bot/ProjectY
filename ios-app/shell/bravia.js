import {
  SonyRemote,
  resolveCommands,
  quickSettingsCandidates,
  cursorPlan,
  tapAction,
  GoogleTvTextAdapter
} from './bravia-core.js';
import {
  loadLayout,
  saveLayout,
  resetLayout,
  loadCursorMode,
  saveCursorMode
} from './bravia-preferences.js';

const $ = selector => document.querySelector(selector);
const labels = {
  power: '⏻ Power', input: 'Input', quick: 'Quick Settings', home: 'Home', back: 'Back',
  up: '▲', left: '◀', confirm: 'OK', right: '▶', down: '▼',
  volumeDown: 'Vol −', mute: 'Mute', volumeUp: 'Vol ＋',
  channelDown: 'Ch −', channelUp: 'Ch ＋', play: 'Play', pause: 'Pause'
};

const status = $('#status');
const controls = $('#controls');
const googleTV = new GoogleTvTextAdapter();
let remote;
let commands = {};
let candidates = [];
let pointerStart;
let editing = false;
let draggedAction = null;
let draggedButton = null;
let movedDuringDrag = false;
let layout = loadLayout(localStorage);

const secure = {
  async set(value) {
    const plugin = globalThis.Capacitor?.Plugins?.YOSSecureCredentials;
    if (!plugin) throw new Error('KeychainはiOS native版でのみ利用できます。');
    await plugin.set({ key: 'braviaPSK', value });
  },
  async get() {
    const plugin = globalThis.Capacitor?.Plugins?.YOSSecureCredentials;
    if (!plugin) throw new Error('KeychainからPSKを取得できません。');
    return (await plugin.get({ key: 'braviaPSK' })).value;
  }
};

function report(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

function commandFor(action) {
  return action === 'quick' ? candidates[0] : commands[action];
}

async function send(action) {
  try {
    if (!remote) throw new Error('先にテレビへ接続してください。');
    const command = commandFor(action);
    if (!command) throw new Error('このテレビでは未対応です。');
    await remote.send(command.code);
    report(command.name + ' を送信しました。');
  } catch (error) {
    report(error.message, true);
  }
}

function moveBefore(action, targetButton) {
  const target = targetButton?.dataset.action;
  if (!action || !target || action === target) return;
  const next = layout.order.filter(item => item !== action);
  next.splice(next.indexOf(target), 0, action);
  layout.order = next;
  movedDuringDrag = true;
  controls.insertBefore(draggedButton, targetButton);
}

function render() {
  controls.classList.toggle('editing', editing);
  controls.replaceChildren();
  for (const action of layout.order) {
    if (layout.hidden.includes(action)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.textContent = labels[action];
    button.disabled = !editing && !commandFor(action);
    button.addEventListener('click', () => {
      if (!editing) return send(action);
      if (movedDuringDrag) return;
      layout.hidden = [...new Set([...layout.hidden, action])];
      layout = saveLayout(localStorage, layout);
      render();
    });
    button.addEventListener('pointerdown', event => {
      if (!editing) return;
      draggedAction = action;
      draggedButton = button;
      movedDuringDrag = false;
      button.classList.add('dragging');
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', event => {
      if (!editing || draggedAction !== action) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('#controls button');
      if (target?.dataset.action) moveBefore(draggedAction, target);
    });
    button.addEventListener('pointerup', () => {
      if (draggedAction !== action) return;
      draggedButton?.classList.remove('dragging');
      draggedAction = null;
      draggedButton = null;
      if (movedDuringDrag) layout = saveLayout(localStorage, layout);
      setTimeout(() => { movedDuringDrag = false; }, 0);
    });
    controls.append(button);
  }
  $('#restore').hidden = !editing || layout.hidden.length === 0;
  $('#reset').hidden = !editing;
  $('#edit-help').hidden = !editing;
}

$('#edit').addEventListener('click', () => {
  editing = !editing;
  $('#edit').textContent = editing ? '編集完了' : '配置を編集';
  render();
});
$('#restore').addEventListener('click', () => {
  layout.hidden = [];
  layout = saveLayout(localStorage, layout);
  render();
});
$('#reset').addEventListener('click', () => {
  layout = resetLayout(localStorage);
  render();
});

$('#connect').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await secure.set($('#psk').value);
    remote = new SonyRemote($('#host').value, secure);
    const map = await remote.discover();
    commands = resolveCommands(map);
    candidates = quickSettingsCandidates(map);
    $('#psk').value = '';
    render();
    report('接続済み · ' + map.size + 'コマンド');
  } catch (error) {
    report(error.message, true);
  }
});

const mode = $('#cursor-mode');
mode.value = loadCursorMode(localStorage);
function updateModeLabel() {
  $('#touchpad-label').textContent = mode.value === 'tap' ? 'Tap a direction' : 'Swipe to move';
}
mode.addEventListener('change', () => {
  saveCursorMode(localStorage, mode.value);
  updateModeLabel();
});
updateModeLabel();

const pad = $('#touchpad');
pad.addEventListener('pointerdown', event => {
  pointerStart = { x: event.offsetX, y: event.offsetY, time: performance.now() };
  pad.setPointerCapture(event.pointerId);
});
pad.addEventListener('pointerup', async event => {
  if (!pointerStart) return;
  const started = pointerStart;
  pointerStart = null;
  if (mode.value === 'tap') {
    return send(tapAction(event.offsetX, event.offsetY, pad.clientWidth, pad.clientHeight));
  }
  const plan = cursorPlan(event.offsetX - started.x, event.offsetY - started.y, performance.now() - started.time);
  if (!plan) return send('confirm');
  for (let index = 0; index < plan.repeats; index += 1) await send(plan.action);
});
pad.addEventListener('keydown', event => {
  const action = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm' }[event.key];
  if (!action) return;
  event.preventDefault();
  send(action);
});

$('#keyboard').addEventListener('click', () => {
  if (!googleTV.available) {
    report('Google TV文字入力はiOS native版でのみ利用できます。', true);
    return;
  }
  $('#google-text').focus();
  report('iPhoneキーボードから入力できます。');
});

$('#pair-start').addEventListener('click', async () => {
  try {
    await googleTV.startPairing($('#host').value);
    $('#pair-code-row').hidden = false;
    $('#pair-code').focus();
    report('テレビに表示された6桁コードを入力してください。');
  } catch (error) {
    report(error.message, true);
  }
});

$('#pair-finish').addEventListener('click', async () => {
  const code = $('#pair-code').value;
  $('#pair-code').value = '';
  try {
    await googleTV.finishPairing(code);
    $('#pair-code-row').hidden = true;
    report('Google TVペアリング完了。');
  } catch (error) {
    report(error.message, true);
  }
});

$('#google-send').addEventListener('click', async () => {
  const text = $('#google-text').value;
  try {
    report('Google TVへ接続中…');
    await googleTV.sendText($('#host').value, text);
    $('#google-text').value = '';
    report('文字を送信しました。');
  } catch (error) {
    report(error.message, true);
  }
});

render();
