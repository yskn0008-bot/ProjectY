'use strict';
(() => {
  const KEYS = { home: 'yos-home-settings-v2', legacy: 'yos-home-settings-v1', taxi: 'yos-taxi-settings-v2', state: 'yos-home-current-state-v1', life: 'yos-life-v1', ideas: 'yos-my-way-ideas-v1', journeys: 'hj-domain-journeys-v1', profile: 'hj-user-profile-v1', scenes: 'hj-daily-scenes-v1' };
  const JST = 'Asia/Tokyo';
  const $ = (id) => document.getElementById(id);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const clean = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const settings = read(KEYS.home, {});
  const state = read(KEYS.state, { energy: '', mood: '', focus: '', savedAt: '' });
  const energyLabels = { low: '体力は低い', mid: '体力は普通', high: '体力は高い' };

  function sharedUrl() { return clean(settings.yosUrl || read(KEYS.legacy, {}).yosUrl || read(KEYS.taxi, {}).yosUrl, 500); }
  function status(message) { $('appStatus').textContent = message; }
  function dateKey() { return new Intl.DateTimeFormat('sv-SE', { timeZone: JST }).format(new Date()); }
  function paintClock() {
    const now = new Date();
    $('clock').textContent = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: JST }).format(now);
    $('date').textContent = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: JST }).format(now);
    $('greeting').textContent = Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: JST }).format(now)) < 12 ? '今日という道を、今ここから歩く。' : 'ここまでを力に、次の一歩へ。';
  }
  function lifeData() { const value = read(KEYS.life, null); return value && typeof value === 'object' ? value : null; }
  function journeyData() { const value = read(KEYS.journeys, []); return Array.isArray(value) ? value : []; }
  function currentJourney(items) { const focus = clean(read(KEYS.profile, {}).focusDomain, 80); return items.find((item) => item?.id === focus) || items[0] || null; }
  function renderData() {
    const life = lifeData();
    const today = life?.days?.[life.activeLifeDate || dateKey()] || life?.days?.[dateKey()] || null;
    const journeys = journeyData();
    const journey = currentJourney(journeys);
    const scenes = read(KEYS.scenes, []);
    const focus = clean(state.focus);
    $('currentSummary').textContent = [energyLabels[state.energy], focus].filter(Boolean).join('。') || '未設定';
    $('focusInput').value = focus;
    $('destinationSummary').textContent = clean(journey?.theme) || clean(journey?.name) || '未設定';
    const done = Array.isArray(today?.doneToday) ? today.doneToday.length : Array.isArray(today?.done) ? today.done.length : null;
    const sceneCount = Array.isArray(scenes) ? scenes.length : 0;
    $('progressSummary').textContent = done !== null ? `今日の記録 ${done}件${sceneCount ? `・物語の記録 ${sceneCount}件` : ''}` : (sceneCount ? `物語の記録 ${sceneCount}件` : 'データなし');
    $('nextSummary').textContent = clean(today?.nextAction) || clean(today?.priority) || '未設定';
    const money = life?.moneySafety || today?.money || {};
    $('moneyIncome').textContent = clean(money.income || money.monthlyIncome) || '未設定';
    $('moneyExpense').textContent = clean(money.expense || money.monthlyExpense) || '未設定';
    $('moneyBalance').textContent = clean(money.currentBalance) || '未設定';
    $('journeyStage').textContent = clean(journey?.stage) || '未設定';
    $('journeyTheme').textContent = clean(journey?.theme) || clean(journey?.name) || '未設定';
    const recentScene = Array.isArray(scenes) ? scenes.at(-1) : null;
    $('journeyScene').textContent = `現在の景色：${clean(recentScene?.title || recentScene?.scene) || 'データなし'}`;
    $('journeyRecent').textContent = clean(recentScene?.summary || recentScene?.title || recentScene?.scene) || 'データなし';
    document.querySelectorAll('[data-state-group="energy"]').forEach((button) => { const selected = button.dataset.value === state.energy; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  }
  function showPage(name) {
    const pages = { home: 'homePage', archive: 'archivePage', money: 'moneyPage', journey: 'journeyPage', idea: 'ideaPage' };
    if (!pages[name]) name = 'home';
    Object.entries(pages).forEach(([key, id]) => { $(id).hidden = key !== name; $(id).classList.toggle('active', key === name); });
    document.querySelectorAll('[data-page]').forEach((item) => item.classList.toggle('active', item.dataset.page === name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
  async function openYos(prompt) {
    const copied = await copy(prompt); const url = sharedUrl(); $('menuDialog').close();
    if (url.startsWith('https://chatgpt.com/')) { status(copied ? '相談文をコピーして、現在のYOSを開きます。' : '現在のYOSを開きます。'); location.href = url; return; }
    status(copied ? '相談文をコピーしました。現在のYOSチャットURLを設定してください。' : '現在のYOSチャットURLを設定してください。');
    $('yosUrl').value = url; $('settingsDialog').showModal();
  }
  document.querySelectorAll('[data-page]').forEach((item) => item.addEventListener('click', () => showPage(item.dataset.page)));
  document.querySelectorAll('[data-prompt]').forEach((item) => item.addEventListener('click', () => openYos(item.dataset.prompt)));
  document.querySelectorAll('[data-state-group="energy"]').forEach((button) => button.addEventListener('click', () => { state.energy = button.dataset.value; renderData(); }));
  $('saveState').addEventListener('click', () => { state.focus = clean($('focusInput').value); state.savedAt = new Date().toISOString(); status(write(KEYS.state, state) ? '今ここを、このiPhoneに保存しました。' : '保存できませんでした。'); renderData(); });
  const idea = read(KEYS.ideas, {}); $('ideaInput').value = clean(idea.text, 500); $('ideaSavedAt').textContent = idea.savedAt ? 'この端末に保存済み' : '未設定';
  $('saveIdea').addEventListener('click', () => { const value = { text: clean($('ideaInput').value, 500), savedAt: new Date().toISOString() }; const saved = write(KEYS.ideas, value); $('ideaSavedAt').textContent = saved ? 'この端末に保存済み' : '保存できませんでした'; status(saved ? 'ひらめきを保存しました。' : '保存できませんでした。'); });
  $('openMenu').addEventListener('click', () => $('menuDialog').showModal());
  $('menuDialog').querySelector('.close').addEventListener('click', () => $('menuDialog').close());
  $('openSettings').addEventListener('click', () => { $('menuDialog').close(); $('yosUrl').value = sharedUrl(); $('settingsDialog').showModal(); });
  $('saveUrl').addEventListener('click', (event) => { event.preventDefault(); settings.yosUrl = clean($('yosUrl').value, 500); const saved = write(KEYS.home, settings); $('settingsDialog').close(); status(saved ? '現在のYOSチャットURLを保存しました。' : '設定を保存できませんでした。'); });
  paintClock(); renderData(); setInterval(paintClock, 30000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => status('オフライン準備に失敗しました。通常表示は利用できます。'));
})();
