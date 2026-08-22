'use strict';

(() => {
  const STORAGE_KEY = 'yos-hero-journey-v1';
  const HOME_KEY = 'yos-home-settings-v2';
  const JST = 'Asia/Tokyo';
  const $ = (id) => document.getElementById(id);

  const defaultState = {
    chapter: '第1章｜始まり',
    chapterMessage: '大きく変えるのではなく、今日の一歩を経験に変える。',
    mainQuest: '',
    selectedXp: 10,
    totalXp: 0,
    quests: [],
    completed: [],
    reflections: [],
    rawInputs: [],
    candidates: [],
    confirmedFacts: [],
    evidence: [],
    unknown: [],
    conversationStatus: null
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
  state.rawInputs = Array.isArray(state.rawInputs) ? state.rawInputs : [];
  state.candidates = Array.isArray(state.candidates) ? state.candidates : [];
  state.confirmedFacts = Array.isArray(state.confirmedFacts) ? state.confirmedFacts : [];
  state.evidence = Array.isArray(state.evidence) ? state.evidence : [];
  state.unknown = Array.isArray(state.unknown) ? state.unknown : [];

  const candidateLabels = {
    fact: 'AIが見つけた事実候補', assumption: 'AIの推測', unknown: '未確認のこと',
    conflict: '矛盾の可能性', nextAction: '次の一歩の候補', memory: '記憶候補（未保存）'
  };

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  };

  const todayKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
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
    while (true) {
      const key = todayKey(cursor);
      if (!days.has(key)) break;
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
    $('chapterTitle').textContent = state.chapter;
    $('chapterMessage').textContent = state.chapterMessage;
    $('chapterInput').value = state.chapter;
    $('chapterMessageInput').value = state.chapterMessage;
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

  function renderCandidate() {
    const pending = state.candidates.filter((item) => item.status === 'pending');
    const candidate = pending[0];
    $('candidatePanel').hidden = !candidate;
    if (!candidate) return;
    $('candidateKind').textContent = candidateLabels[candidate.kind] || '未確認の候補';
    $('candidateText').textContent = candidate.text;
    $('candidateProgress').textContent = `未確認 ${pending.length}件`;
  }

  function render() {
    renderChapter();
    renderStats();
    renderQuests();
    renderCompleted();
    renderReflection();
    renderCandidate();
  }

  const candidateId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

  const asText = (value) => {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      for (const key of ['text', 'statement', 'content', 'value', 'title', 'action']) {
        if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
      }
    }
    return '';
  };

  function mapCandidates(result, rawInputId) {
    const mapped = [];
    const add = (values, kind) => (Array.isArray(values) ? values : []).forEach((value) => {
      const text = asText(value);
      if (!text) return;
      mapped.push({
        id: candidateId(), rawInputId, kind, text, status: 'pending',
        sourceIds: Array.isArray(value?.sourceIds) ? value.sourceIds.filter((id) => typeof id === 'string') : [],
        createdAt: new Date().toISOString()
      });
    });
    add(result?.facts, 'fact');
    add(result?.assumptions, 'assumption');
    add(result?.unknowns, 'unknown');
    add(result?.conflicts, 'conflict');
    if (result?.nextAction) add([result.nextAction], 'nextAction');
    add(result?.memoryCandidates, 'memory');
    return mapped;
  }

  const apiErrorMessage = (status) => ({
    400: '入力内容を確認してください。話した内容は端末に保存済みです。',
    401: 'Googleログインまたは同期認証を確認してください。話した内容は端末に保存済みです。',
    403: 'この画面からは接続できません。話した内容は端末に保存済みです。',
    405: 'アプリ更新が必要です。話した内容は端末に保存済みです。',
    413: '入力が長すぎます。短くして再試行してください。話した内容は端末に保存済みです。',
    415: 'アプリ更新が必要です。話した内容は端末に保存済みです。',
    429: '少し時間を空けてください。話した内容は端末に保存済みです。',
    503: 'YOSへ接続できません。話した内容は端末に保存済みです。'
  }[status] || 'YOSへ接続できません。話した内容は端末に保存済みです。');

  async function sendConversation() {
    const text = $('rawInput').value.trim();
    if (!text) {
      $('conversationStatus').textContent = '今のことを一言だけ話してください。';
      $('rawInput').focus();
      return;
    }
    const rawInput = { id: candidateId(), text, createdAt: new Date().toISOString() };
    state.rawInputs.unshift(rawInput);
    state.conversationStatus = { state: 'saved', rawInputId: rawInput.id, updatedAt: new Date().toISOString() };
    if (!save()) {
      state.rawInputs = state.rawInputs.filter((item) => item.id !== rawInput.id);
      $('conversationStatus').textContent = '端末へ保存できませんでした。入力はこの画面に残しています。';
      return;
    }
    $('conversationStatus').textContent = '端末に保存しました。YOSへ接続しています。';
    $('candidatePanel').hidden = true;

    const baseUrl = typeof globalThis.YOS_AI_BASE_URL === 'string' ? globalThis.YOS_AI_BASE_URL.trim() : '';
    const getToken = globalThis.YOS_AUTH?.getGoogleIdToken;
    if (!baseUrl || typeof getToken !== 'function') {
      state.conversationStatus = { state: 'local-only', rawInputId: rawInput.id, updatedAt: new Date().toISOString() };
      save();
      $('conversationStatus').textContent = '話した内容を端末に保存しました。YOS AIはまだ設定されていません。';
      return;
    }

    try {
      const token = await getToken();
      if (typeof token !== 'string' || !token.trim()) throw Object.assign(new Error('Missing token'), { status: 401 });
      const response = await fetch(new URL('/api/yos/chat', baseUrl), {
        method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userText: text, currentLocation: state.chapter.slice(0, 300) })
      });
      if (!response.ok) throw Object.assign(new Error('YOS request failed'), { status: response.status });
      const result = await response.json();
      const mapped = mapCandidates(result, rawInput.id);
      state.candidates.push(...mapped);
      state.evidence.push(...mapped.filter((item) => item.sourceIds.length).map((item) => ({
        candidateId: item.id, sourceIds: item.sourceIds, requestId: result.requestId || null
      })));
      state.conversationStatus = {
        state: mapped.length ? 'confirming' : 'reviewed', rawInputId: rawInput.id,
        requestId: result.requestId || null, updatedAt: new Date().toISOString()
      };
      save();
      $('rawInput').value = '';
      $('conversationStatus').textContent = mapped.length
        ? 'AIの整理を受け取りました。候補を1件ずつ確認してください。'
        : 'AIの整理を受け取りました。確認する候補はありません。';
      renderCandidate();
    } catch (error) {
      state.conversationStatus = { state: 'failed', rawInputId: rawInput.id, updatedAt: new Date().toISOString() };
      save();
      $('candidatePanel').hidden = true;
      $('conversationStatus').textContent = apiErrorMessage(Number(error?.status) || 0);
    }
  }

  function decideCandidate(decision) {
    const candidate = state.candidates.find((item) => item.status === 'pending');
    if (!candidate) return;
    candidate.status = decision === 'yes' ? 'confirmed' : decision === 'unknown' ? 'unknown' : 'rejected';
    candidate.decidedAt = new Date().toISOString();
    if (decision === 'yes') {
      state.confirmedFacts.push({
        id: candidate.id, text: candidate.text, kind: candidate.kind,
        sourceIds: candidate.sourceIds, confirmedAt: candidate.decidedAt
      });
      if (candidate.kind === 'nextAction') state.mainQuest = candidate.text;
    } else if (decision === 'unknown') {
      state.unknown.push({ id: candidate.id, text: candidate.text, kind: candidate.kind, savedAt: candidate.decidedAt });
    }
    const pending = state.candidates.some((item) => item.status === 'pending');
    state.conversationStatus = { state: pending ? 'confirming' : 'confirmed', updatedAt: new Date().toISOString() };
    save();
    renderChapter();
    renderCandidate();
    $('conversationStatus').textContent = pending ? '次の候補を確認してください。' : '候補の確認が終わりました。';
  }

  function addQuest() {
    const title = $('questInput').value.trim();
    if (!title) {
      setStatus('クエストの内容を入力してください。');
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
    setStatus('今日のクエストを追加しました。');
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

  function saveReflection() {
    const text = $('reflectionInput').value.trim();
    if (!text) {
      setStatus('今日わかったことを一言だけ残してください。');
      $('reflectionInput').focus();
      return;
    }
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
    setStatus('今日の経験を保存しました。');
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
    saveReflection();
    const active = state.quests.map((quest) => `・${quest.title}`).join('\n') || '・なし';
    const reflection = $('reflectionInput').value.trim() || '未記録';
    const prompt = `【ヒーローズジャーニー｜振り返り】\n現在の章：${state.chapter}\nメインクエスト：${state.mainQuest || '未設定'}\n進行中：\n${active}\n今日の経験：${reflection}\n\nこの経験を次の一手に変えて。`;
    const copied = await copyText(prompt);
    const home = readJson(HOME_KEY, {});
    if (typeof home.yosUrl === 'string' && home.yosUrl.startsWith('https://chatgpt.com/')) {
      setStatus(copied ? '振り返り文をコピーしてYOSを開きます。' : 'YOSを開きます。');
      window.location.href = home.yosUrl;
      return;
    }
    setStatus(copied ? '振り返り文をコピーしました。YOSホームでチャットURLを設定してください。' : 'YOSホームでチャットURLを設定してください。');
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
  $('saveMainQuest').addEventListener('click', () => {
    state.mainQuest = $('mainQuestInput').value.trim();
    save();
    setStatus('メインクエストを保存しました。');
  });
  $('saveReflection').addEventListener('click', saveReflection);
  $('consultYos').addEventListener('click', consultYos);
  $('sendConversation').addEventListener('click', sendConversation);
  document.querySelectorAll('[data-candidate-decision]').forEach((button) => {
    button.addEventListener('click', () => decideCandidate(button.dataset.candidateDecision));
  });
  $('openJourneySettings').addEventListener('click', () => $('journeySettingsDialog').showModal());
  $('saveJourneySettings').addEventListener('click', (event) => {
    event.preventDefault();
    state.chapter = $('chapterInput').value.trim() || defaultState.chapter;
    state.chapterMessage = $('chapterMessageInput').value.trim() || defaultState.chapterMessage;
    save();
    renderChapter();
    $('journeySettingsDialog').close();
    setStatus('物語の章を更新しました。');
  });

  render();
})();
