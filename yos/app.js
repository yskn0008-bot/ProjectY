'use strict';

(() => {
  const HOME_KEY = 'yos-home-settings-v2';
  const LEGACY_HOME_KEY = 'yos-home-settings-v1';
  const TAXI_KEY = 'yos-taxi-settings-v2';
  const STATE_KEY = 'yos-home-current-state-v1';
  const JOURNEY_KEY = 'yos-hero-journey-v1';
  const PROFILE_KEY = 'yos-journey-profile-v1';
  const BACKUP_SCHEMA = 'heros-journey-backup';
  const BACKUP_VERSION = 1;
  const JST = 'Asia/Tokyo';
  const $ = (id) => document.getElementById(id);

  const STAGES = [
    '日常世界', '冒険への誘い', 'ためらい', 'メンターとの出会い',
    '最初の境界線', '試練・仲間・敵', '最も深い場所へ', '最大の試練',
    '報酬', '帰路', '復活', '宝を持って帰還'
  ];

  const stageMessages = {
    '日常世界': '今いる場所を否定せず、変えたいことを一つだけ言葉にしよう。',
    '冒険への誘い': '気になって離れないものは、旅からの呼びかけかもしれない。',
    'ためらい': '怖さは止まる理由ではなく、準備する場所を教えるデータ。',
    'メンターとの出会い': '答えを渡すのではなく、自分で選べる地図を一緒に作ろう。',
    '最初の境界線': '完璧な準備より、戻れる小さな一歩で境界線を越えよう。',
    '試練・仲間・敵': 'うまくいかない出来事から、味方・弱点・再現条件を見つけよう。',
    '最も深い場所へ': '避けてきた核心を、小さく安全に観察する時。',
    '最大の試練': '結果より、安全と自分らしさを守りながら挑むことを優先しよう。',
    '報酬': '得たものを数字だけでなく、経験・自信・選択肢として受け取ろう。',
    '帰路': '新しい学びを、日常で続く仕組みに変えよう。',
    '復活': '過去の自分へ戻るのではなく、経験を持った自分として選び直そう。',
    '宝を持って帰還': '得た宝を、次の人生と周りへどう生かすか決めよう。'
  };

  const labels = {
    energy: { low: '低い', mid: '普通', high: '高い' },
    mood: { heavy: '重い', calm: '穏やか', good: '良い' }
  };

  const read = (key, fallback = {}) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
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

  function normalizeJourney(value = {}) {
    const stage = STAGES.includes(value.stage) ? value.stage : '日常世界';
    return {
      chapter: cleanText(value.chapter, 60) || '第1章｜旅の始まり',
      chapterMessage: cleanText(value.chapterMessage, 120) || '人生を一気に変えなくていい。今日の一歩から物語は動き出す。',
      stage,
      calling: cleanText(value.calling, 180),
      mainQuest: cleanText(value.mainQuest, 100),
      selectedXp: [10, 20, 30].includes(Number(value.selectedXp)) ? Number(value.selectedXp) : 10,
      totalXp: Math.max(0, Math.min(999999, Number(value.totalXp) || 0)),
      quests: Array.isArray(value.quests) ? value.quests.map(normalizeQuest).filter(Boolean).slice(0, 100) : [],
      completed: Array.isArray(value.completed) ? value.completed.map(normalizeQuest).filter(Boolean).slice(0, 500) : [],
      reflections: Array.isArray(value.reflections) ? value.reflections.map(normalizeReflection).filter(Boolean).slice(0, 3650) : []
    };
  }

  function normalizeProfile(value = {}) {
    return {
      name: cleanText(value.name, 30),
      onboarded: Boolean(value.onboarded),
      createdAt: cleanText(value.createdAt, 60)
    };
  }

  function normalizeHeroState(value = {}) {
    return {
      energy: ['low', 'mid', 'high'].includes(value.energy) ? value.energy : '',
      mood: ['heavy', 'calm', 'good'].includes(value.mood) ? value.mood : '',
      focus: cleanText(value.focus, 120),
      savedAt: cleanText(value.savedAt, 60)
    };
  }

  const settings = read(HOME_KEY, {});
  const currentState = normalizeHeroState(read(STATE_KEY, {}));
  const profile = normalizeProfile(read(PROFILE_KEY, {}));
  let selectedStage = '';

  const journeyState = () => normalizeJourney(read(JOURNEY_KEY, {}));
  const saveJourney = (journey) => write(JOURNEY_KEY, normalizeJourney(journey));
  const setStatus = (message) => { $('appStatus').textContent = message; };

  function sharedUrl() {
    const legacy = read(LEGACY_HOME_KEY, {});
    const taxi = read(TAXI_KEY, {});
    return cleanText(settings.yosUrl, 2048) || cleanText(legacy.yosUrl, 2048) || cleanText(taxi.yosUrl, 2048);
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
    return stageMessages[journey.stage] || '今の自分から、次の一歩を一つだけ決めよう。';
  }

  function renderProfile() {
    const name = profile.name.trim();
    $('storyOwner').textContent = name ? `${name}の物語` : 'あなたの物語';
    $('storyFooter').textContent = name
      ? `主人公は${name}。YOSは、その旅を支えるメンター。`
      : '主人公はあなた。YOSは、その旅を支えるメンター。';
  }

  function renderStageProgress(journey) {
    const index = Math.max(0, STAGES.indexOf(journey.stage));
    const progress = ((index + 1) / STAGES.length) * 100;
    $('stageProgressLabel').textContent = `${index + 1} / ${STAGES.length}`;
    $('stageProgressBar').style.width = `${progress}%`;
  }

  function renderHomeQuests(journey) {
    const list = $('homeQuestList');
    list.innerHTML = '';
    journey.quests.slice(0, 3).forEach((quest) => {
      const row = document.createElement('article');
      row.className = 'home-quest-item';

      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = quest.title;
      const meta = document.createElement('small');
      meta.textContent = `${quest.xp} XP`;
      copy.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'home-quest-actions';
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'quest-complete';
      done.textContent = '達成';
      done.setAttribute('aria-label', `${quest.title}を達成にする`);
      done.addEventListener('click', () => completeQuest(quest.id));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'quest-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `${quest.title}を削除する`);
      remove.addEventListener('click', () => removeQuest(quest.id));
      actions.append(done, remove);
      row.append(copy, actions);
      list.appendChild(row);
    });
    $('emptyHomeQuest').hidden = journey.quests.length > 0;
  }

  function renderJourney() {
    const journey = journeyState();
    const level = Math.floor(journey.totalXp / 100) + 1;
    const todayReflection = journey.reflections.find((item) => item.day === todayKey());
    $('journeyStage').textContent = journey.stage;
    $('journeyLevel').textContent = `LEVEL ${level}`;
    $('chapterTitle').textContent = journey.chapter;
    $('chapterMessage').textContent = journey.chapterMessage;
    $('mentorMessage').textContent = mentorMessage(journey);
    $('mainQuest').textContent = journey.mainQuest || journey.calling || 'まだ決まっていません';
    $('nextStep').textContent = journey.quests[0]?.title || '小さなクエストを一つ作ろう。';
    $('totalXp').textContent = journey.totalXp;
    $('completedCount').textContent = journey.completed.length;
    $('streakCount').textContent = calculateStreak(journey.reflections);
    renderStageProgress(journey);
    renderHomeQuests(journey);
    if (document.activeElement !== $('reflectionInput')) $('reflectionInput').value = todayReflection?.text || '';
    $('reflectionSavedAt').textContent = todayReflection ? `保存 ${formatDateTime(todayReflection.savedAt)}` : '未記録';
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
    $('stateSavedAt').textContent = currentState.savedAt ? `保存 ${formatDateTime(currentState.savedAt)}` : '未記録';
  }

  function saveCurrentState() {
    currentState.focus = $('focusInput').value.trim();
    currentState.savedAt = new Date().toISOString();
    const saved = write(STATE_KEY, normalizeHeroState(currentState));
    $('stateSavedAt').textContent = saved ? `保存 ${formatDateTime(currentState.savedAt)}` : '保存できませんでした';
    setStatus(saved ? '今の状態を、この端末に保存しました。' : '状態を保存できませんでした。');
    renderJourney();
    return saved;
  }

  function selectStage(stage) {
    selectedStage = STAGES.includes(stage) ? stage : '冒険への誘い';
    document.querySelectorAll('[data-stage]').forEach((button) => {
      const selected = button.dataset.stage === selectedStage;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function showDialog(dialog) {
    try { dialog.showModal(); }
    catch { dialog.setAttribute('open', ''); }
  }

  function openOnboarding(force = false) {
    const journey = journeyState();
    $('heroName').value = profile.name || '';
    $('callingInput').value = journey.calling || '';
    selectStage(STAGES.includes(journey.stage) && journey.stage !== '日常世界' ? journey.stage : '冒険への誘い');
    if (force) setStatus('初回設定を更新できます。');
    showDialog($('onboardingDialog'));
  }

  function saveOnboarding(event) {
    event.preventDefault();
    const name = $('heroName').value.trim();
    const calling = $('callingInput').value.trim();
    const journey = journeyState();
    profile.name = name;
    profile.onboarded = true;
    profile.createdAt = profile.createdAt || new Date().toISOString();
    journey.stage = selectedStage || journey.stage || '冒険への誘い';
    journey.calling = calling;
    if (!journey.mainQuest && calling) journey.mainQuest = calling;
    if (/^第1章[｜|]/u.test(journey.chapter) && name) journey.chapter = `第1章｜${name}の旅の始まり`;
    const saved = write(PROFILE_KEY, normalizeProfile(profile)) && saveJourney(journey);
    if (!saved) { setStatus('物語を保存できませんでした。'); return; }
    $('onboardingDialog').close();
    renderProfile();
    renderJourney();
    setStatus('物語が始まりました。今日の一歩を一つ決めよう。');
  }

  function addQuickQuest(event) {
    event.preventDefault();
    const input = $('quickQuestInput');
    const title = input.value.trim();
    if (!title) { setStatus('今日できる小さな一歩を入力してください。'); input.focus(); return; }
    const journey = journeyState();
    journey.quests.unshift({ id: randomId(), title, xp: 10, createdAt: new Date().toISOString() });
    if (!journey.mainQuest) journey.mainQuest = journey.calling || title;
    if (!saveJourney(journey)) { setStatus('クエストを保存できませんでした。'); return; }
    input.value = '';
    renderJourney();
    setStatus('今日の一歩をクエストに追加しました。');
  }

  function completeQuest(id) {
    const journey = journeyState();
    const index = journey.quests.findIndex((quest) => quest.id === id);
    if (index < 0) return;
    const [quest] = journey.quests.splice(index, 1);
    quest.completedAt = new Date().toISOString();
    journey.completed.unshift(quest);
    journey.totalXp += Number(quest.xp) || 0;
    if (!saveJourney(journey)) { setStatus('達成を保存できませんでした。'); return; }
    renderJourney();
    setStatus(`達成。${quest.xp} XPを経験として追加しました。`);
  }

  function removeQuest(id) {
    const journey = journeyState();
    const quest = journey.quests.find((item) => item.id === id);
    if (!quest) return;
    if (!window.confirm(`「${quest.title}」を削除しますか？`)) return;
    journey.quests = journey.quests.filter((item) => item.id !== id);
    if (!saveJourney(journey)) { setStatus('削除を保存できませんでした。'); return; }
    renderJourney();
    setStatus('一歩を削除しました。');
  }

  function saveReflection(showStatus = true) {
    const text = $('reflectionInput').value.trim();
    if (!text) {
      if (showStatus) setStatus('今日わかったことを一言だけ残してください。');
      $('reflectionInput').focus();
      return false;
    }
    const journey = journeyState();
    const day = todayKey();
    const existing = journey.reflections.find((item) => item.day === day);
    if (existing) { existing.text = text; existing.savedAt = new Date().toISOString(); }
    else journey.reflections.unshift({ day, text, savedAt: new Date().toISOString() });
    const saved = saveJourney(journey);
    renderJourney();
    if (showStatus) setStatus(saved ? '今日の経験を保存しました。' : '経験を保存できませんでした。');
    return saved;
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
    const name = profile.name || 'ユーザー';
    return `【Hero's Journey｜YOSメンターモード】\n主人公：${name}\n${topic}\n\n現在の章：${journey.chapter}\n旅の段階：${journey.stage}\n冒険からの呼びかけ：${journey.calling || '未設定'}\nメインクエスト：${journey.mainQuest || '未設定'}\n次の一歩：${next}\n体力：${energy}\n気持ち：${mood}\n気になっていること：${focus}\n\n主人公の代わりに答えを決めず、安全・自己一致・長期的な期待値を守るメンターとして、今できる一歩を一つに絞って。失敗や違和感も経験資産として扱って。`;
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
    openSettings();
  }

  function openSettings() {
    const journey = journeyState();
    $('settingsHeroName').value = profile.name || '';
    $('settingsChapter').value = journey.chapter;
    $('settingsStage').value = journey.stage;
    $('settingsCalling').value = journey.calling || '';
    $('yosUrl').value = sharedUrl();
    showDialog($('settingsDialog'));
  }

  function saveSettings(event) {
    event.preventDefault();
    const journey = journeyState();
    const url = $('yosUrl').value.trim();
    profile.name = $('settingsHeroName').value.trim();
    journey.chapter = $('settingsChapter').value.trim() || journey.chapter;
    journey.stage = STAGES.includes($('settingsStage').value) ? $('settingsStage').value : journey.stage;
    journey.calling = $('settingsCalling').value.trim();
    if (!journey.mainQuest && journey.calling) journey.mainQuest = journey.calling;
    settings.yosUrl = url;
    const taxi = read(TAXI_KEY, {});
    taxi.yosUrl = url;
    const saved = write(PROFILE_KEY, normalizeProfile(profile)) && saveJourney(journey) && write(HOME_KEY, settings) && write(TAXI_KEY, taxi);
    $('settingsDialog').close();
    renderProfile();
    renderJourney();
    setStatus(saved ? '物語の設定を保存しました。' : '設定を保存できませんでした。');
  }

  function backupPayload() {
    return {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      profile: normalizeProfile(profile),
      journey: journeyState(),
      heroState: normalizeHeroState(currentState)
    };
  }

  async function exportStory() {
    const json = JSON.stringify(backupPayload(), null, 2);
    const filename = `heros-journey-${todayKey()}.json`;
    const file = new File([json], filename, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Hero's Journey バックアップ", files: [file] });
        setStatus('物語のバックアップを共有しました。');
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('物語のバックアップを保存しました。');
  }

  async function importStoryFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.schema !== BACKUP_SCHEMA || Number(data.version) !== BACKUP_VERSION) {
        throw new Error('unsupported-backup');
      }
      const nextProfile = normalizeProfile(data.profile || {});
      const nextJourney = normalizeJourney(data.journey || {});
      const nextState = normalizeHeroState(data.heroState || {});
      if (!window.confirm('現在の物語データを、このバックアップで置き換えますか？')) return;
      const saved = write(PROFILE_KEY, nextProfile) && write(JOURNEY_KEY, nextJourney) && write(STATE_KEY, nextState);
      if (!saved) throw new Error('storage-failed');
      window.location.reload();
    } catch {
      setStatus('バックアップを復元できませんでした。正しいJSONファイルを選んでください。');
    }
  }

  function resetStory() {
    if (!window.confirm('章・クエスト・XP・経験・体調をすべて削除しますか？この操作は戻せません。')) return;
    try {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(JOURNEY_KEY);
      localStorage.removeItem(STATE_KEY);
      window.location.reload();
    } catch {
      setStatus('物語データを削除できませんでした。');
    }
  }

  document.querySelectorAll('[data-state-group]').forEach((button) => button.addEventListener('click', () => applyStateSelection(button.dataset.stateGroup, button.dataset.value)));
  document.querySelectorAll('[data-topic]').forEach((button) => button.addEventListener('click', () => openYos(mentorPrompt(button.dataset.topic))));
  document.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => selectStage(button.dataset.stage)));

  $('consultMentor').addEventListener('click', () => openYos(mentorPrompt('今の状況を話すので、旅の現在地を確認して次の一歩を一緒に決めて。')));
  $('editJourney').addEventListener('click', openSettings);
  $('quickQuestForm').addEventListener('submit', addQuickQuest);
  $('saveState').addEventListener('click', saveCurrentState);
  $('consultState').addEventListener('click', () => {
    saveCurrentState();
    openYos(mentorPrompt('この体力・気持ち・違和感を前提に、無理なく進める一歩を一つ決めて。'));
  });
  $('saveReflection').addEventListener('click', () => saveReflection(true));
  $('reflectWithYos').addEventListener('click', () => {
    const saved = saveReflection(false);
    if (saved) openYos(mentorPrompt(`【今日の経験】${$('reflectionInput').value.trim()}\nこの経験から、次に使える学びと次の一歩を取り出して。`));
  });
  $('onboardingForm').addEventListener('submit', saveOnboarding);
  $('saveSettings').addEventListener('click', saveSettings);
  $('exportStory').addEventListener('click', exportStory);
  $('importStory').addEventListener('click', () => $('importStoryFile').click());
  $('importStoryFile').addEventListener('change', importStoryFile);
  $('restartStory').addEventListener('click', () => { $('settingsDialog').close(); openOnboarding(true); });
  $('resetStory').addEventListener('click', resetStory);

  paintClock();
  renderProfile();
  restoreState();
  renderJourney();
  setInterval(paintClock, 30000);
  if (!profile.onboarded) window.setTimeout(() => openOnboarding(false), 150);
  window.addEventListener('pageshow', () => { renderProfile(); renderJourney(); });
  window.addEventListener('storage', (event) => {
    if ([JOURNEY_KEY, STATE_KEY, PROFILE_KEY].includes(event.key)) { renderProfile(); renderJourney(); }
  });
  window.addEventListener('online', () => setStatus('オンラインに戻りました。'));
  window.addEventListener('offline', () => setStatus('オフラインです。記録はこの端末に保存されます。'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { renderProfile(); renderJourney(); }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => setStatus('オフライン準備に失敗しました。通常表示は利用できます。'));
  }
})();
