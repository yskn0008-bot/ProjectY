'use strict';

(() => {
  const HOME_KEY = 'yos-home-settings-v2';
  const LEGACY_HOME_KEY = 'yos-home-settings-v1';
  const TAXI_KEY = 'yos-taxi-settings-v2';
  const STATE_KEY = 'yos-home-current-state-v1';
  const MISSION_CACHE_KEY = 'yos-mission-control-cache-v1';
  const JST = 'Asia/Tokyo';

  const $ = (id) => document.getElementById(id);
  const read = (key, fallback = {}) => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  const settings = read(HOME_KEY, {});
  const currentState = read(STATE_KEY, { energy: '', mood: '', focus: '', savedAt: '' });

  const labels = {
    energy: { low: '低い', mid: '普通', high: '高い' },
    mood: { heavy: '重い', calm: '穏やか', good: '良い' }
  };

  function sharedUrl() {
    const legacy = read(LEGACY_HOME_KEY, {});
    const taxi = read(TAXI_KEY, {});
    return settings.yosUrl || legacy.yosUrl || taxi.yosUrl || '';
  }

  function setStatus(message) {
    $('appStatus').textContent = message;
  }

  function formatDateTime(value) {
    if (!value) return '未記録';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未記録';
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: JST
    }).format(date);
  }

  function paintClock() {
    const now = new Date();
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: JST
    }).format(now));

    $('clock').textContent = new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: JST
    }).format(now);
    $('date').textContent = new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      timeZone: JST
    }).format(now);

    const greeting = hour < 11
      ? 'おはよう。今日の人生を、無理なく整えよう。'
      : hour < 18
        ? '今の状況を見て、次の一手を一つに絞ろう。'
        : '今日の経験を、明日の判断へつなげよう。';
    $('greeting').textContent = greeting;
  }

  function applyStateSelection(group, value) {
    currentState[group] = value;
    document.querySelectorAll(`[data-state-group="${group}"]`).forEach((button) => {
      const selected = button.dataset.value === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function restoreState() {
    if (currentState.energy) applyStateSelection('energy', currentState.energy);
    if (currentState.mood) applyStateSelection('mood', currentState.mood);
    $('focusInput').value = currentState.focus || '';
    $('stateSavedAt').textContent = currentState.savedAt
      ? `保存 ${formatDateTime(currentState.savedAt)}`
      : '未記録';
  }

  function saveCurrentState() {
    currentState.focus = $('focusInput').value.trim();
    currentState.savedAt = new Date().toISOString();
    const saved = write(STATE_KEY, currentState);
    $('stateSavedAt').textContent = saved
      ? `保存 ${formatDateTime(currentState.savedAt)}`
      : '保存できませんでした';
    setStatus(saved
      ? '今の状態を、このiPhoneに保存しました。'
      : '状態を保存できませんでした。');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    }
  }

  async function openYos(promptText) {
    const copied = await copyText(promptText);
    const url = sharedUrl();
    if (url.startsWith('https://chatgpt.com/')) {
      setStatus(copied
        ? '相談文をコピーしてYOSを開きます。'
        : 'YOSを開きます。相談文は手動で入力してください。');
      window.location.href = url;
      return;
    }

    setStatus(copied
      ? '相談文をコピーしました。YOSチャットURLを設定してください。'
      : 'YOSチャットURLを設定してください。');
    $('yosUrl').value = url;
    $('settingsDialog').showModal();
  }

  function statePrompt() {
    const energy = labels.energy[currentState.energy] || '未選択';
    const mood = labels.mood[currentState.mood] || '未選択';
    const focus = $('focusInput').value.trim() || '特になし';
    return `【YOS｜今の状態】\n体力：${energy}\n気持ち：${mood}\n気になっていること：${focus}\n\nこの状態を前提に、安全と人生全体の期待値を考えて、今やることを一つに絞って。`;
  }

  function missionPriority(project) {
    let stage = 6;
    if (project.health === 'critical') stage = 0;
    else if (project.status === 'blocked') stage = 1;
    else if (project.status === 'review') stage = 2;
    else if (project.status === 'active' && Number(project.priority) === 1) stage = 3;
    else if (project.status === 'active') stage = 4;
    else if (project.status === 'paused') stage = 5;

    return [stage, Number(project.priority) || 9];
  }

  function comparePriority(a, b) {
    const priorityA = missionPriority(a);
    const priorityB = missionPriority(b);
    for (let index = 0; index < priorityA.length; index += 1) {
      if (priorityA[index] !== priorityB[index]) return priorityA[index] - priorityB[index];
    }
    return 0;
  }

  function setMissionChip(text, stateClass) {
    const chip = $('missionState');
    chip.classList.remove('online', 'offline');
    if (stateClass) chip.classList.add(stateClass);
    const textNode = Array.from(chip.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = text;
  }

  function renderMission(data, source = 'online') {
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const inbox = Array.isArray(data.inbox) ? data.inbox : [];
    const candidates = projects
      .filter((project) => ['active', 'blocked', 'review'].includes(project.status) && project.next_action)
      .sort(comparePriority);
    const next = candidates[0];

    $('nextAction').textContent = next?.next_action
      || inbox[0]?.next_action
      || '次の作業はまだ登録されていません。';
    $('activeCount').textContent = projects.filter((project) => project.status === 'active').length;
    $('attentionCount').textContent = projects.filter((project) => ['attention', 'critical'].includes(project.health)).length;
    $('inboxCount').textContent = inbox.length;
    $('missionUpdated').textContent = data.updated_at
      ? `更新 ${formatDateTime(data.updated_at)}`
      : '更新日時なし';

    setMissionChip(source === 'online' ? '同期済み' : '保存データ', source === 'online' ? 'online' : 'offline');
  }

  async function loadMission() {
    const button = $('refreshMission');
    button.disabled = true;
    setMissionChip('更新中', '');

    try {
      const response = await fetch('../data/mission-control.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      write(MISSION_CACHE_KEY, data);
      renderMission(data, 'online');
    } catch {
      const cached = read(MISSION_CACHE_KEY, null);
      if (cached) {
        renderMission(cached, 'cache');
        setStatus('Mission Controlは保存済みデータを表示しています。');
      } else {
        $('nextAction').textContent = 'Mission Controlへ接続できません。通信状態を確認してください。';
        $('activeCount').textContent = '—';
        $('attentionCount').textContent = '—';
        $('inboxCount').textContent = '—';
        $('missionUpdated').textContent = 'データなし';
        setMissionChip('未接続', 'offline');
      }
    } finally {
      button.disabled = false;
    }
  }

  document.querySelectorAll('[data-state-group]').forEach((button) => {
    button.addEventListener('click', () => {
      applyStateSelection(button.dataset.stateGroup, button.dataset.value);
    });
  });

  document.querySelectorAll('[data-prompt]').forEach((button) => {
    button.addEventListener('click', () => openYos(button.dataset.prompt));
  });

  $('saveState').addEventListener('click', saveCurrentState);
  $('consultState').addEventListener('click', () => {
    saveCurrentState();
    openYos(statePrompt());
  });
  $('refreshMission').addEventListener('click', loadMission);
  $('openSettings').addEventListener('click', () => {
    $('yosUrl').value = sharedUrl();
    $('settingsDialog').showModal();
  });
  $('saveUrl').addEventListener('click', (event) => {
    event.preventDefault();
    const url = $('yosUrl').value.trim();
    settings.yosUrl = url;
    const saved = write(HOME_KEY, settings);
    const taxi = read(TAXI_KEY, {});
    taxi.yosUrl = url;
    write(TAXI_KEY, taxi);
    $('settingsDialog').close();
    setStatus(saved
      ? (url ? 'YOSチャットURLを保存しました。' : 'YOSチャットURLを削除しました。')
      : '設定を保存できませんでした。');
  });

  paintClock();
  restoreState();
  loadMission();
  setInterval(paintClock, 30000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      setStatus('オフライン準備に失敗しました。通常表示は利用できます。');
    });
  }
})();
