'use strict';

(() => {
  const STORAGE_KEY = 'yos-hero-journey-v1';
  const HOME_KEY = 'yos-home-settings-v2';
  const STATE_KEY = 'yos-home-current-state-v1';
  const PROFILE_KEY = 'yos-journey-profile-v1';
  const JST = 'Asia/Tokyo';
  const $ = (id) => document.getElementById(id);

  const STAGES = [
    '日常世界', '冒険への誘い', 'ためらい', 'メンターとの出会い',
    '最初の境界線', '試練・仲間・敵', '最も深い場所へ', '最大の試練',
    '報酬', '帰路', '復活', '宝を持って帰還'
  ];

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

  const defaultState = {
    chapter: '第1章｜旅の始まり',
    chapterMessage: '人生を一気に変えなくていい。今日の一歩から物語は動き出す。',
    stage: '日常世界',
    calling: '',
    mainQuest: '',
    selectedXp: 10,
    totalXp: 0,
    quests: [],
    completed: [],
    reflections: []
  };

  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  };

  const cleanText = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const randomId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function normalizeQuest(value) {
    if (!value || typeof value !== 'object') return null;
    const title = cleanText(value.title, 100);
    if (!title) return null;
    return {
      id: cleanText(value.id, 180) || randomId(),
      title,
      xp: [10, 20, 30].includes(Number(value.xp)) ? Number(value.xp) : 10,
      createdAt: cleanText(value.createdAt, 60) || new Date().toISOString(),
      ...(cleanText(value.completedAt, 60) ? { completedAt: cleanText(value.completedAt, 60) } : {})
    };
  }

  function normalizeReflection(value) {
    if (!value || typeof value !== 'object') return null;
    const text = cleanText(value.text, 400);
    const day = cleanText(value.day, 10);
    if (!text || !/^\d{4}-\d{2}-\d{2}$/u.test(day)) return null;
    return { day, text, savedAt: cleanText(value.savedAt, 60) || new Date().toISOString() };
  }

  function normalizeState(value = {}) {
    return {
      chapter: cleanText(value.chapter, 60) || defaultState.chapter,
      chapterMessage: cleanText(value.chapterMessage, 120) || defaultState.chapterMessage,
      stage: STAGES.includes(value.stage) ? value.stage : defaultState.stage,
      calling: cleanText(value.calling, 180),
      mainQuest: cleanText(value.mainQuest, 100),
      selectedXp: [10, 20, 30].includes(Number(value.selectedXp)) ? Number(value.selectedXp) : 10,
      totalXp: Math.max(0, Math.min(999999, Number(value.totalXp) || 0)),
      quests: Array.isArray(value.quests) ? value.quests.map(normalizeQuest).filter(Boolean).slice(0, 100) : [],
      completed: Array.isArray(value.completed) ? value.completed.map(normalizeQuest).filter(Boolean).slice(0, 500) : [],
      reflections: Array.isArray(value.reflections) ? value.reflections.map(normalizeReflection).filter(Boolean).slice(0, 3650) : []
    };
  }

  const state = normalizeState(readJson(STORAGE_KEY, {}));
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
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

  const formatDay = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value || '')) return value || '';
    const date = new Date(`${value}T12:00:00+09:00`);
    return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: JST }).format(date);
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

  function renderStageMap() {
    const currentIndex = Math.max(0, STAGES.indexOf(state.stage));
    const map = $('stageMap');
    map.innerHTML = '';
    STAGES.forEach((stage, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stage-map-item';
      if (index < currentIndex) button.classList.add('past');
      if (index === currentIndex) button.classList.add('current');
      if (index > currentIndex) button.classList.add('future');
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-current', index === currentIndex ? 'step' : 'false');

      const number = document.createElement('span');
      number.textContent = String(index + 1);
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = stage;
      const guide = document.createElement('small');
      guide.textContent = stageGuides[stage];
      copy.append(title, guide);
      button.append(number, copy);
      button.addEventListener('click', () => setStage(stage));
      map.appendChild(button);
    });
    $('stagePosition').textContent = `${currentIndex + 1} / ${STAGES.length}`;
    $('previousStage').disabled = currentIndex === 0;
    $('nextStage').disabled = currentIndex === STAGES.length - 1;
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

      const actions = document.createElement('div');
      actions.className = 'quest-item-actions';
      const complete = document.createElement('button');
      complete.type = 'button';
      complete.className = 'quest-done';
      complete.textContent = '達成';
      complete.addEventListener('click', () => completeQuest(quest.id));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'quest-delete';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `${quest.title}を削除する`);
      remove.addEventListener('click', () => removeQuest(quest.id));
      actions.append(complete, remove);
      row.append(copy, actions);
      list.appendChild(row);
    });
    $('activeQuestCount').textContent = `${state.quests.length}件`;
    $('emptyQuest').hidden = state.quests.length > 0;
  }

  function renderCompleted() {
    const list = $('completedList');
    list.innerHTML = '';
    state.completed.slice(0, 7).forEach((quest) => {
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
    if (document.activeElement !== $('reflectionInput')) $('reflectionInput').value = latest?.text || '';
    $('reflectionSavedAt').textContent = latest ? `保存 ${formatDate(latest.savedAt)}` : '未記録';
  }

  function renderReflectionHistory() {
    const list = $('reflectionList');
    list.innerHTML = '';
    state.reflections.slice(0, 7).forEach((item) => {
      const row = document.createElement('article');
      row.className = 'reflection-item';
      const day = document.createElement('span');
      day.textContent = formatDay(item.day);
      const text = document.createElement('p');
      text.textContent = item.text;
      row.append(day, text);
      list.appendChild(row);
    });
    $('emptyReflections').hidden = state.reflections.length > 0;
  }

  function render() {
    renderChapter();
    renderStageMap();
    renderStats();
    renderQuests();
    renderCompleted();
    renderReflection();
    renderReflectionHistory();
    document.querySelectorAll('[data-xp]').forEach((button) => {
      button.classList.toggle('selected', Number(button.dataset.xp) === Number(state.selectedXp));
    });
  }

  function setStage(stage) {
    if (!STAGES.includes(stage) || state.stage === stage) return;
    state.stage = stage;
    if (!save()) { setStatus('旅の段階を保存できませんでした。'); return; }
    renderChapter();
    renderStageMap();
    setStatus(`現在地を「${stage}」へ更新しました。`);
  }

  function moveStage(offset) {
    const index = Math.max(0, STAGES.indexOf(state.stage));
    const next = Math.max(0, Math.min(STAGES.length - 1, index + offset));
    setStage(STAGES[next]);
  }

  function addQuest() {
    const title = $('questInput').value.trim();
    if (!title) {
      setStatus('次の一歩を入力してください。');
      $('questInput').focus();
      return;
    }
    state.quests.unshift({ id: randomId(), title, xp: Number(state.selectedXp) || 10, createdAt: new Date().toISOString() });
    if (!state.mainQuest) state.mainQuest = state.calling || title;
    $('questInput').value = '';
    if (!save()) { setStatus('次の一歩を保存できませんでした。'); return; }
    render();
    setStatus('次の一歩を追加しました。');
  }

  function completeQuest(id) {
    const index = state.quests.findIndex((quest) => quest.id === id);
    if (index < 0) return;
    const [quest] = state.quests.splice(index, 1);
    quest.completedAt = new Date().toISOString();
    state.completed.unshift(quest);
    state.totalXp += Number(quest.xp) || 0;
    if (!save()) { setStatus('達成を保存できませんでした。'); return; }
    render();
    setStatus(`達成。${quest.xp} XPを経験として追加しました。`);
  }

  function removeQuest(id) {
    const quest = state.quests.find((item) => item.id === id);
    if (!quest) return;
    if (!window.confirm(`「${quest.title}」を削除しますか？`)) return;
    state.quests = state.quests.filter((item) => item.id !== id);
    if (!save()) { setStatus('削除を保存できませんでした。'); return; }
    renderQuests();
    setStatus('一歩を削除しました。');
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
    const saved = save();
    renderReflection();
    renderReflectionHistory();
    renderStats();
    if (showMessage) setStatus(saved ? '今日の経験を保存しました。' : '経験を保存できませんでした。');
    return saved;
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
    const profile = readJson(PROFILE_KEY, {});
    const name = cleanText(profile.name, 30) || 'ユーザー';
    const prompt = `【Hero's Journey｜YOSメンターモード】\n主人公：${name}\n現在の章：${state.chapter}\n旅の段階：${state.stage}\n冒険からの呼びかけ：${state.calling || '未設定'}\nメインクエスト：${state.mainQuest || '未設定'}\n進行中の一歩：\n${active}\n今日の経験・違和感：${reflection}\n体力：${cleanText(heroState.energy, 20) || '未選択'}\n気持ち：${cleanText(heroState.mood, 20) || '未選択'}\n\n主人公の代わりに答えを決めず、安全・自己一致・長期的な期待値を守るメンターとして、この経験の意味を整理し、次の一歩を一つに絞って。失敗や違和感も経験資産として扱って。`;
    const copied = await copyText(prompt);
    const home = readJson(HOME_KEY, {});
    if (typeof home.yosUrl === 'string' && home.yosUrl.startsWith('https://chatgpt.com/')) {
      setStatus(copied ? '旅の記録をコピーしてYOSを開きます。' : 'YOSを開きます。');
      window.location.href = home.yosUrl;
      return;
    }
    setStatus(copied ? '旅の記録をコピーしました。ホームの設定でYOSチャットURLを登録してください。' : 'ホームの設定でYOSチャットURLを登録してください。');
  }

  document.querySelectorAll('[data-xp]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedXp = Number(button.dataset.xp) || 10;
      save();
      document.querySelectorAll('[data-xp]').forEach((item) => item.classList.toggle('selected', item === button));
    });
  });

  $('addQuest').addEventListener('click', addQuest);
  $('questInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') addQuest(); });
  $('previousStage').addEventListener('click', () => moveStage(-1));
  $('nextStage').addEventListener('click', () => moveStage(1));
  $('saveCalling').addEventListener('click', () => {
    state.calling = $('callingInput').value.trim();
    if (!state.mainQuest && state.calling) state.mainQuest = state.calling;
    if (!save()) { setStatus('呼びかけを保存できませんでした。'); return; }
    renderChapter();
    setStatus('冒険からの呼びかけを保存しました。');
  });
  $('saveMainQuest').addEventListener('click', () => {
    state.mainQuest = $('mainQuestInput').value.trim();
    if (!save()) { setStatus('メインクエストを保存できませんでした。'); return; }
    setStatus('メインクエストを保存しました。');
  });
  $('saveReflection').addEventListener('click', saveReflection);
  $('consultYos').addEventListener('click', consultYos);
  $('openJourneySettings').addEventListener('click', () => $('journeySettingsDialog').showModal());
  $('saveJourneySettings').addEventListener('click', (event) => {
    event.preventDefault();
    state.chapter = $('chapterInput').value.trim() || defaultState.chapter;
    state.stage = STAGES.includes($('stageInput').value) ? $('stageInput').value : defaultState.stage;
    state.chapterMessage = $('chapterMessageInput').value.trim() || defaultState.chapterMessage;
    if (!save()) { setStatus('物語の現在地を保存できませんでした。'); return; }
    render();
    $('journeySettingsDialog').close();
    setStatus('物語の現在地を更新しました。');
  });

  render();
})();
