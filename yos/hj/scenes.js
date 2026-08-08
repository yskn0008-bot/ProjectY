'use strict';
(() => {
  const STAGES = ['日常世界','冒険への誘い','ためらい','メンターとの出会い','最初の境界線','試練・仲間・敵','最も深い場所へ','最大の試練','報酬','帰路','復活','宝を持って帰還'];
  const KEYS = {
    journeys: 'hj-domain-journeys-v1',
    stories: 'hj-weekly-stories-v1',
    profile: 'hj-user-profile-v1',
    scenes: 'hj-daily-scenes-v1'
  };
  const SCHEMA = 'hj-complete-backup-v2';
  const $ = (id) => document.getElementById(id);
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const clean = (value, max = 600) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
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
  const setStatus = (message) => {
    if ($('appStatus')) $('appStatus').textContent = message;
  };

  function normalizeScene(value) {
    if (!value || typeof value !== 'object') return null;
    const fact = clean(value.fact, 600);
    if (!fact) return null;
    const occurredAt = clean(value.occurredAt, 60);
    const date = new Date(occurredAt);
    return {
      id: clean(value.id, 100) || uid(),
      occurredAt: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
      domainId: clean(value.domainId, 100),
      stage: STAGES.includes(value.stage) ? value.stage : STAGES[0],
      fact,
      choice: clean(value.choice, 400),
      result: clean(value.result, 400),
      reflection: clean(value.reflection, 400),
      savedAt: clean(value.savedAt, 60) || new Date().toISOString()
    };
  }

  let scenes = read(KEYS.scenes, []).map(normalizeScene).filter(Boolean).slice(0, 500);

  function journeys() {
    const value = read(KEYS.journeys, []);
    return Array.isArray(value) ? value : [];
  }

  function localInputValue(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function weekBounds(reference = new Date()) {
    const date = new Date(reference);
    date.setHours(0, 0, 0, 0);
    const mondayOffset = (date.getDay() + 6) % 7;
    const start = new Date(date);
    start.setDate(date.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
  }

  function weekLabel(reference = new Date()) {
    const { start, end } = weekBounds(reference);
    const last = new Date(end.getTime() - 1);
    const fmt = (date) => new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(date);
    return `${fmt(start)}〜${fmt(last)}`;
  }

  function currentWeekScenes() {
    const { start, end } = weekBounds();
    return scenes
      .filter((scene) => {
        const time = new Date(scene.occurredAt).getTime();
        return time >= start.getTime() && time < end.getTime();
      })
      .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  }

  function formatSceneDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '日時不明';
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  function stageOptions(selected) {
    return STAGES.map((stage) => `<option${stage === selected ? ' selected' : ''}>${stage}</option>`).join('');
  }

  function renderDomainOptions() {
    const items = journeys();
    const select = $('sceneDomain');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '';
    items.forEach((journey) => {
      const option = document.createElement('option');
      option.value = journey.id;
      option.textContent = `${journey.icon || '🧭'} ${journey.name}`;
      select.appendChild(option);
    });
    const profile = read(KEYS.profile, null);
    const nextValue = items.some((item) => item.id === current)
      ? current
      : items.some((item) => item.id === profile?.focusDomain)
        ? profile.focusDomain
        : items[0]?.id || '';
    select.value = nextValue;
    syncSceneStage();
  }

  function syncSceneStage() {
    const domain = journeys().find((item) => item.id === $('sceneDomain')?.value);
    if ($('sceneStage')) $('sceneStage').innerHTML = stageOptions(domain?.stage || STAGES[0]);
  }

  function clearSceneForm() {
    $('sceneAt').value = localInputValue();
    $('sceneFact').value = '';
    $('sceneChoice').value = '';
    $('sceneResult').value = '';
    $('sceneReflection').value = '';
    renderDomainOptions();
  }

  function saveScene() {
    const fact = clean($('sceneFact').value, 600);
    if (!fact) {
      setStatus('実際に起きたことを一文だけ入力してください。');
      $('sceneFact').focus();
      return;
    }
    const occurredAt = new Date($('sceneAt').value || Date.now());
    const scene = normalizeScene({
      id: uid(),
      occurredAt: occurredAt.toISOString(),
      domainId: $('sceneDomain').value,
      stage: $('sceneStage').value,
      fact,
      choice: $('sceneChoice').value,
      result: $('sceneResult').value,
      reflection: $('sceneReflection').value,
      savedAt: new Date().toISOString()
    });
    scenes.unshift(scene);
    scenes = scenes.slice(0, 500);
    if (!write(KEYS.scenes, scenes)) {
      setStatus('シーンを保存できませんでした。');
      return;
    }
    clearSceneForm();
    renderScenes();
    setStatus('今日のシーンを保存しました。');
  }

  function deleteScene(id) {
    if (!confirm('このシーンを削除しますか？')) return;
    scenes = scenes.filter((scene) => scene.id !== id);
    write(KEYS.scenes, scenes);
    renderScenes();
    setStatus('シーンを削除しました。');
  }

  function appendDetail(parent, label, value) {
    if (!value) return;
    const detail = document.createElement('p');
    detail.className = 'scene-detail';
    detail.textContent = `${label}：${value}`;
    parent.appendChild(detail);
  }

  function renderScenes() {
    const box = $('sceneHistory');
    if (!box) return;
    const items = currentWeekScenes().slice().reverse();
    const domains = journeys();
    box.innerHTML = '';
    items.forEach((scene) => {
      const domain = domains.find((item) => item.id === scene.domainId);
      const article = document.createElement('article');
      article.className = 'scene-item';

      const meta = document.createElement('div');
      meta.className = 'scene-meta';
      [formatSceneDate(scene.occurredAt), `${domain?.icon || '🧭'} ${domain?.name || '未設定'}`, scene.stage].forEach((text) => {
        const chip = document.createElement('span');
        chip.textContent = text;
        meta.appendChild(chip);
      });
      article.appendChild(meta);

      const title = document.createElement('h3');
      title.textContent = scene.fact;
      article.appendChild(title);
      appendDetail(article, '選んだこと', scene.choice);
      appendDetail(article, '結果', scene.result);
      appendDetail(article, '本人の気づき', scene.reflection);

      const remove = document.createElement('button');
      remove.className = 'scene-delete';
      remove.type = 'button';
      remove.setAttribute('aria-label', 'シーンを削除');
      remove.textContent = '×';
      remove.addEventListener('click', () => deleteScene(scene.id));
      article.appendChild(remove);
      box.appendChild(article);
    });
    $('emptyScenes').hidden = items.length > 0;
    $('sceneWeekCount').textContent = `${items.length}件`;
  }

  function mostFrequentDomain(items) {
    const counts = new Map();
    items.forEach((scene) => counts.set(scene.domainId, (counts.get(scene.domainId) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  function lineFor(scene, field) {
    const value = scene[field];
    if (!value) return '';
    const date = new Date(scene.occurredAt);
    const time = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    const domain = journeys().find((item) => item.id === scene.domainId);
    return `・${time}［${domain?.name || '未設定'}／${scene.stage}］${value}`;
  }

  function collectWeek() {
    const items = currentWeekScenes();
    if (!items.length) {
      setStatus('今週のシーンがまだありません。');
      return;
    }
    $('storyPeriod').value = weekLabel();
    const domainId = mostFrequentDomain(items);
    if ([...$('storyDomain').options].some((option) => option.value === domainId)) $('storyDomain').value = domainId;
    $('storyFacts').value = items.map((scene) => lineFor(scene, 'fact')).filter(Boolean).join('\n').slice(0, 1200);
    $('storyChoice').value = items.map((scene) => lineFor(scene, 'choice')).filter(Boolean).join('\n').slice(0, 800);
    $('storyResult').value = items.map((scene) => lineFor(scene, 'result')).filter(Boolean).join('\n').slice(0, 800);
    $('storyLearning').value = items.map((scene) => lineFor(scene, 'reflection')).filter(Boolean).join('\n').slice(0, 800);
    document.querySelector('[data-tab="story"]')?.click();
    $('storyPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus(`${items.length}件の事実を「今週の物語」へまとめました。内容を確認してから作品化してください。`);
  }

  function activateSceneTab() {
    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === 'scenes');
    });
    $('journeysPanel')?.classList.remove('active');
    $('storyPanel')?.classList.remove('active');
    $('scenePanel')?.classList.add('active');
    renderDomainOptions();
    renderScenes();
  }

  function exportAll() {
    const payload = {
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      journeys: read(KEYS.journeys, []),
      stories: read(KEYS.stories, []),
      profile: read(KEYS.profile, null),
      scenes
    };
    const text = JSON.stringify(payload, null, 2);
    const file = new File([text], `heros-journey-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
    const shareOrDownload = async () => {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title: "Hero's Journey バックアップ", files: [file] });
          setStatus('共有シートを開きました。');
          return;
        }
      } catch {}
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('全データのバックアップを書き出しました。');
    };
    shareOrDownload();
  }

  async function importAll(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || typeof payload !== 'object') throw new Error('invalid');
      if (!Array.isArray(payload.journeys) || !Array.isArray(payload.stories)) throw new Error('invalid');
      const importedScenes = Array.isArray(payload.scenes) ? payload.scenes.map(normalizeScene).filter(Boolean).slice(0, 500) : [];
      write(KEYS.journeys, payload.journeys);
      write(KEYS.stories, payload.stories);
      if (payload.profile && typeof payload.profile === 'object') write(KEYS.profile, payload.profile);
      write(KEYS.scenes, importedScenes);
      setStatus('バックアップを復元しました。再読み込みします。');
      setTimeout(() => location.reload(), 300);
    } catch {
      setStatus('このファイルは復元できませんでした。');
    }
  }

  function resetAll() {
    if (!confirm('HJに保存した旅・シーン・物語・プロフィールをすべて削除しますか？')) return;
    Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
    setStatus('HJのデータを削除しました。再読み込みします。');
    setTimeout(() => location.reload(), 300);
  }

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      $('scenePanel')?.classList.toggle('active', button.dataset.tab === 'scenes');
      if (button.dataset.tab === 'scenes') {
        renderDomainOptions();
        renderScenes();
      }
    });
  });
  $('openScene')?.addEventListener('click', activateSceneTab);
  $('sceneDomain')?.addEventListener('change', syncSceneStage);
  $('saveScene')?.addEventListener('click', saveScene);
  $('clearScene')?.addEventListener('click', () => {
    clearSceneForm();
    setStatus('シーン入力をクリアしました。');
  });
  $('collectWeek')?.addEventListener('click', collectWeek);
  $('addDomain')?.addEventListener('click', () => setTimeout(renderDomainOptions, 50));
  document.addEventListener('click', (event) => {
    if (event.target?.dataset?.role === 'save') setTimeout(renderDomainOptions, 50);
  }, true);

  $('exportData')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    exportAll();
  }, true);
  $('resetData')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    resetAll();
  }, true);
  $('importData')?.addEventListener('click', () => $('importFile')?.click());
  $('importFile')?.addEventListener('change', () => {
    const file = $('importFile').files?.[0];
    if (file) importAll(file);
    $('importFile').value = '';
  });

  clearSceneForm();
  renderScenes();
})();
