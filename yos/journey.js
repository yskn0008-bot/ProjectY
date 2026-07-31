'use strict';

(() => {
  const STORAGE_KEY = 'yos-hero-journey-v1';
  const HOME_KEY = 'yos-home-settings-v2';
  const STATE_KEY = 'yos-home-current-state-v1';
  const JST = 'Asia/Tokyo';
  const $ = (id) => document.getElementById(id);

  const defaultState = {
    chapter: '第1章｜始まり',
    chapterMessage: '大きく変えるのではなく、今日の一歩を経験に変える。',
    stage: '日常世界',
    calling: '',
    mainQuest: '',
    selectedXp: 10,
    totalXp: 0,
    quests: [],
    completed: [],
    reflections: []
  };

  const stageGuides = {
    '日常世界': '今いる場所を否定せず、変えたいことを一つだけ言葉にしよう。',
    '冒険への誘い': '気になって離れないものは、旅からの呼びかけかもしれない。',
    'ためらい': '怖さは止まる理由ではなく、準備する場所を教えるデータ。',
    'メンターとの出会い': '答えを渡すのではなく、自分で選べる地図を一緒に作ろう。',
    '最初の境界線': '戻れる小さな一歩で、新しい世界へ足を入れよう。',
    '試練・仲間・敵': '出来事から、味方・弱点・再現条件を見つけよう。',
    '最も深い場所へ': '避けてきた核心を、安全に小さく観察する時。',
    '最大の試練': '安全と自己一致を守りながら、いちばん大切な挑戦へ。',
    '報酬': '得たものを、経験・自信・選択肢として受け取ろう。',
    '帰路': '新しい学びを、日常で続く仕組みに変えよう。',
    '復活': '経験を持った自分として、もう一度選び直そう。',
    '宝を持って帰還': '得た宝を、次の人生と周りへどう生かすか決めよう。'
  };

  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  };

  const state = { ...defaultState, ...readJson(STORAGE_KEY, {}) };
  state.quests = Array.isArray(state.quests) ? state.quests : [];
  state.completed = Array.isArray(state.completed) ? state.completed : [];
  state.reflections = Array.isArray(state.reflections) ? state.reflections : [];

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  };

  const todayKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
    timeZone: JST, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: JST
    }).format(date);
  };

  const setStatus = (message) => { $('journeyStatus').textContent = message; };

  function calculateStreak() {
    const days = new Set(state.reflections.map((item) => item.day).filter(Boolean));
    let streak = 0;
    const cursor = new Date();
    while (days.has(todayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function renderStats() {
    const level = Math.floor(state.totalXp / 100) + 1;
    const currentXp = state.totalXp % 100;
    $('levelLabel').textContent = `LEVEL ${level}`;
    $('xpLabel').textContent = `${currentXp} / 100 XP`;
    $('xpBar').style.width = `${currentXp}%`;
    $('totalXp').textContent = state.totalXp;
    $('completedCount').textContent = state.completed.length;
    $('streakCount').textContent = calculateStreak();
  }

  function renderChapter() {
    $('stageLabel').textContent = state.stage;
    $('stageGuide').textContent = stageGuides[state.stage] || stageGuides['日常世界'];
    $('chapterTitle').textContent = state.chapter;
    $('chapterMessage').textContent = state.chapterMessage;
    $('chapterInput').value = state.chapter;
    $('stageInput').value = state.stage;
    $('chapterMessageInput').value = state.chapterMessage;
    $('callingInput').value = state.calling;
    $('mainQuestInput').value = state.mainQuest;
  }

  function renderQuests() {
    const list = $('questList');
    list.innerHTML = '';
    state.quests.forEach((quest) => {
      const row = document.createElement('article');
      row.className = 'quest-item';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = quest.title;
      const meta = document.createElement('small');
      meta.textContent = `${quest.xp} XP・追加 ${formatDate(quest.createdAt)}`;
      copy.append(title, meta);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '達成';
      button.addEventListener('click', () => completeQuest(quest.id));
      row.append(copy, button);
      list.appendChild(row);
    });
    $('activeQuestCount').textContent = `${state.quests.length}件`;
    $('emptyQuest').hidden = state.quests.length > 0;
  }

  function renderCompleted() {
    const list = $('completedList');
    list.innerHTML = '';
    state.completed.slice(0, 5).forEach((quest) => {
      const row = document.createElement('article');
      row.className = 'completed-item';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = quest.title;
      const meta = document.createElement('small');
      meta.textContent = formatDate(quest.completedAt);
      copy.append(title, meta);
      const xp = document.createElement('span');
      xp.textContent = `+${quest.xp} XP`;
      row.append(copy, xp);
      list.appendChild(row);
    });
    $('emptyCompleted').hidden = state.completed.length > 0;
  }

  function renderReflection() {
    const latest = state.reflections.find((item) => item.day === todayKey());
    $('reflectionInput').value = latest?.text || '';
    $('reflectionSavedAt').textContent = latest ? `保存 ${formatDate(latest.savedAt)}` : '未記録';
  }

  function render() {
    renderChapter();
    renderStats();
    renderQuests();
    renderCompleted();
    renderReflection();
  }

  function addQuest() {
    const title = $('questInput').value.trim();
    if (!title) {
      setStatus('次の一歩を入力してください。');
      $('questInput').focus();
      return;
    }
    state.quests.unshift({
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      title,
      xp: Number(state.selectedXp) || 10,
      createdAt: new Date().toISOString()
    });
    $('questInput').value = '';
    save();
    renderQuests();
    setStatus('次の一歩を追加しました。');
  }

  function completeQuest(id) {
    const index = state.quests.findIndex((quest) => quest.id === id);
    if (index < 0) return;
    const [quest] = state.quests.splice(index, 1);
    quest.completedAt = new Date().toISOString();
    state.completed.unshift(quest);
    state.totalXp += Number(quest.xp) || 0;
    save();
    renderStats();
    renderQuests();
    renderCompleted();
    setStatus(`達成。${quest.xp} XPを経験として追加しました。`);
  }

  function storeReflection(showMessage = true) {
    const text = $('reflectionInput').value.trim();
    if (!text) return false;
    const day = todayKey();
    const existing = state.reflections.find((item) => item.day === day);
    if (existing) {
      existing.text = text;
      existing.savedAt = new Date().toISOString();
    } else {
      state.reflections.unshift({ day, text, savedAt: new Date().toISOString() });
    }
    save();
    renderReflection();
    renderStats();
    if (showMessage) setStatus('今日の経験を保存しました。');
    return true;
  }

  function saveReflection() {
    if (!storeReflection(true)) {
      setStatus('今日わかったことを一言だけ残してください。');
      $('reflectionInput').focus();
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    }
  }

  async function consultYos() {
    storeReflection(false);
    const active = state.quests.map((quest) => `・${quest.title}`).join('\n') || '・なし';
    const reflection = $('reflectionInput').value.trim() || '未記録';
    const heroState = readJson(STATE_KEY, {});
    const prompt = `【YOS｜ヒーローズジャーニー・メンターモード】\n現在の章：${state.chapter}\n旅の段階：${state.stage}\n冒険からの呼びかけ：${state.calling || '未設定'}\nメインクエスト：${state.mainQuest || '未設定'}\n進行中の一歩：\n${active}\n今日の経験・違和感：${reflection}\n体力：${heroState.energy || '未選択'}\n気持ち：${heroState.mood || '未選択'}\n\nようすけが主人公。YOSは安全・自己一致・長期的な期待値を守るメンターとして、この経験の意味を整理し、次の一歩を一つに絞って。答えを押しつけず、失敗も経験資産として扱って。`;
    const copied = await copyText(prompt);
    const home = readJson(HOME_KEY, {});
    if (typeof home.yosUrl === 'string' && home.yosUrl.startsWith('https://chatgpt.com/')) {
      setStatus(copied ? '旅の記録をコピーしてYOSを開きます。' : 'YOSを開きます。');
      window.location.href = home.yosUrl;
      return;
    }
    setStatus(copied ? '旅の記録をコピーしました。YOSホームでチャットURLを設定してください。' : 'YOSホームでチャットURLを設定してください。');
  }

  document.querySelectorAll('[data-xp]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedXp = Number(button.dataset.xp) || 10;
      document.querySelectorAll('[data-xp]').forEach((item) => item.classList.toggle('selected', item === button));
    });
  });

  $('addQuest').addEventListener('click', addQuest);
  $('questInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addQuest();
  });
  $('saveCalling').addEventListener('click', () => {
    state.calling = $('callingInput').value.trim();
    save();
    setStatus('冒険からの呼びかけを保存しました。');
  });
  $('saveMainQuest').addEventListener('click', () => {
    state.mainQuest = $('mainQuestInput').value.trim();
    save();
    setStatus('メインクエストを保存しました。');
  });
  $('saveReflection').addEventListener('click', saveReflection);
  $('consultYos').addEventListener('click', consultYos);
  $('openJourneySettings').addEventListener('click', () => $('journeySettingsDialog').showModal());
  $('saveJourneySettings').addEventListener('click', (event) => {
    event.preventDefault();
    state.chapter = $('chapterInput').value.trim() || defaultState.chapter;
    state.stage = $('stageInput').value || defaultState.stage;
    state.chapterMessage = $('chapterMessageInput').value.trim() || defaultState.chapterMessage;
    save();
    renderChapter();
    $('journeySettingsDialog').close();
    setStatus('物語の現在地を更新しました。');
  });

  render();
})();
