'use strict';

(() => {
  const HOME_KEY = 'yos-home-settings-v2';
  const LEGACY_HOME_KEY = 'yos-home-settings-v1';
  const TAXI_KEY = 'yos-taxi-settings-v2';
  const STATE_KEY = 'yos-home-current-state-v1';
  const JOURNEY_KEY = 'yos-hero-journey-v1';
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

  function journeyState() {
    const value = read(JOURNEY_KEY, {});
    return {
      chapter: value.chapter || '第1章｜始まり',
      chapterMessage: value.chapterMessage || '大きく変えるのではなく、今日の一歩を経験に変える。',
      stage: value.stage || '日常世界',
      calling: value.calling || '',
      mainQuest: value.mainQuest || '',
      totalXp: Number(value.totalXp) || 0,
      quests: Array.isArray(value.quests) ? value.quests : [],
      completed: Array.isArray(value.completed) ? value.completed : [],
      reflections: Array.isArray(value.reflections) ? value.reflections : []
    };
  }

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
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: JST
    }).format(date);
  }

  function todayKey(date = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: JST, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
  }

  function calculateStreak(reflections) {
    const days = new Set(reflections.map((item) => item.day).filter(Boolean));
    let streak = 0;
    const cursor = new Date();
    while (days.has(todayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function paintClock() {
    const now = new Date();
    $('clock').textContent = new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: JST
    }).format(now);
    $('date').textContent = new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric', day: 'numeric', weekday: 'short', timeZone: JST
    }).format(now);
  }

  function mentorMessage(journey) {
    if (currentState.energy === 'low') return '今日は守ることも旅の一歩。体力を減らさず進める方法を選ぼう。';
    if (currentState.mood === 'heavy') return '重さを消そうとしなくていい。今の気持ちを持ったまま進める一歩を探そう。';
    const messages = {
      '日常世界': '今いる場所を否定せず、変えたいことを一つだけ言葉にしよう。',
      '冒険への誘い': '気になって離れないものは、旅からの呼びかけかもしれない。',
      'ためらい': '怖さは止まる理由ではなく、準備する場所を教えるデータ。',
      'メンターとの出会い': '答えを渡すのではなく、自分で選べる地図を一緒に作ろう。',
      '最初の境界線': '完璧な準備より、戻れる小さな一歩で境界線を越えよう。',
      '試練・仲間・敵': 'うまくいかない出来事から、味方・弱点・再現条件を見つけよう。',
      '最も深い場所へ': '避けてきた核心を、小さく安全に観察する時。',
      '最大の試練': '結果より、安全と自己一致を守りながら挑むことを優先しよう。',
      '報酬': '得たものを数字だけでなく、経験・自信・選択肢として受け取ろう。',
      '帰路': '新しい学びを、日常で続く仕組みに変えよう。',
      '復活': '過去の自分へ戻るのではなく、経験を持った自分として選び直そう。',
      '宝を持って帰還': '得た宝を次の人生と周りへどう生かすか決めよう。'
    };
    return messages[journey.stage] || '今の自分から、次の一歩を一つだけ決めよう。';
  }

  function renderJourney() {
    const journey = journeyState();
    const level = Math.floor(journey.totalXp / 100) + 1;
    $('journeyStage').textContent = journey.stage;
    $('journeyLevel').textContent = `LEVEL ${level}`;
    $('chapterTitle').textContent = journey.chapter;
    $('chapterMessage').textContent = journey.chapterMessage;
    $('mentorMessage').textContent = mentorMessage(journey);
    $('mainQuest').textContent = journey.mainQuest || 'まだ決まっていません';
    $('nextStep').textContent = journey.quests[0]?.title || '小さなクエストを一つ作ろう。';
    $('totalXp').textContent = journey.totalXp;
    $('completedCount').textContent = journey.completed.length;
    $('streakCount').textContent = calculateStreak(journey.reflections);
  }

  function applyStateSelection(group, value) {
    currentState[group] = value;
    document.querySelectorAll(`[data-state-group="${group}"]`).forEach((button) => {
      const selected = button.dataset.value === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    renderJourney();
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
    setStatus(saved ? '今の状態を、このiPhoneに保存しました。' : '状態を保存できませんでした。');
    renderJourney();
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

  function mentorPrompt(topic) {
    const journey = journeyState();
    const energy = labels.energy[currentState.energy] || '未選択';
    const mood = labels.mood[currentState.mood] || '未選択';
    const focus = $('focusInput').value.trim() || currentState.focus || '特になし';
    const next = journey.quests[0]?.title || '未設定';
    return `【YOS｜ヒーローズジャーニー・メンターモード】\n${topic}\n\n現在の章：${journey.chapter}\n旅の段階：${journey.stage}\n冒険からの呼びかけ：${journey.calling || '未設定'}\nメインクエスト：${journey.mainQuest || '未設定'}\n次の一歩：${next}\n体力：${energy}\n気持ち：${mood}\n気になっていること：${focus}\n\nようすけが主人公。YOSは答えを押しつけず、安全・自己一致・長期的な期待値を守るメンターとして、今できる一歩を一つに絞って。失敗や違和感も経験資産として扱って。`;
  }

  async function openYos(promptText) {
    const copied = await copyText(promptText);
    const url = sharedUrl();
    if (url.startsWith('https://chatgpt.com/')) {
      setStatus(copied ? '相談文をコピーしてYOSを開きます。' : 'YOSを開きます。');
      window.location.href = url;
      return;
    }
    setStatus(copied ? '相談文をコピーしました。先にYOSチャットURLを設定してください。' : 'YOSチャットURLを設定してください。');
    $('yosUrl').value = url;
    $('settingsDialog').showModal();
  }

  document.querySelectorAll('[data-state-group]').forEach((button) => {
    button.addEventListener('click', () => applyStateSelection(button.dataset.stateGroup, button.dataset.value));
  });

  document.querySelectorAll('[data-topic]').forEach((button) => {
    button.addEventListener('click', () => openYos(mentorPrompt(button.dataset.topic)));
  });

  $('consultMentor').addEventListener('click', () => {
    openYos(mentorPrompt('今の状況を話すので、旅の現在地を確認して次の一歩を一緒に決めて。'));
  });
  $('saveState').addEventListener('click', saveCurrentState);
  $('consultState').addEventListener('click', () => {
    saveCurrentState();
    openYos(mentorPrompt('この体力・気持ち・違和感を前提に、無理なく進める一歩を一つ決めて。'));
  });
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
    setStatus(saved ? (url ? 'YOSチャットURLを保存しました。' : 'YOSチャットURLを削除しました。') : '設定を保存できませんでした。');
  });

  paintClock();
  restoreState();
  renderJourney();
  setInterval(paintClock, 30000);
  window.addEventListener('pageshow', renderJourney);
  window.addEventListener('storage', (event) => {
    if (event.key === JOURNEY_KEY || event.key === STATE_KEY) renderJourney();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderJourney();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      setStatus('オフライン準備に失敗しました。通常表示は利用できます。');
    });
  }
})();
