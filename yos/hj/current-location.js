'use strict';

(() => {
  const KEYS = { journeys: 'hj-domain-journeys-v1', profile: 'hj-user-profile-v1', scenes: 'hj-daily-scenes-v1' };
  const STAGES = ['日常世界','冒険への誘い','ためらい','メンターとの出会い','最初の境界線','試練・仲間・敵','最も深い場所へ','最大の試練','報酬','帰路','復活','宝を持って帰還'];
  const ARCHETYPES = Array.isArray(globalThis.HJ_ARCHETYPES) ? globalThis.HJ_ARCHETYPES : [];
  const ARCHETYPE_IDS = new Set(ARCHETYPES.map((item) => item.id));
  const $ = (id) => document.getElementById(id);
  const clean = (value, max = 400) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  };
  const status = (message) => { if ($('appStatus')) $('appStatus').textContent = message; };
  let active = [];

  function journeys() {
    const value = read(KEYS.journeys, []);
    return Array.isArray(value) ? value : [];
  }

  function selectedJourney() {
    const items = journeys();
    return items.find((item) => item.id === $('mapJourney')?.value) || items[0] || null;
  }

  function normalizeReality(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      body: clean(source.body, 120),
      mind: clean(source.mind, 120),
      time: clean(source.time, 120),
      money: clean(source.money, 120),
      relationships: clean(source.relationships, 120),
      environment: clean(source.environment, 120)
    };
  }

  function normalizeArchetypes(value) {
    const source = value && typeof value === 'object' ? value : {};
    const selected = Array.isArray(source.active) ? source.active : [];
    return {
      active: [...new Set(selected.filter((id) => ARCHETYPE_IDS.has(id)))].slice(0, 3),
      needed: ARCHETYPE_IDS.has(source.needed) ? source.needed : '',
      balance: ['helping', 'overused', 'unknown'].includes(source.balance) ? source.balance : '',
      note: clean(source.note, 400)
    };
  }

  function renderJourneyOptions() {
    const select = $('mapJourney');
    if (!select) return;
    const items = journeys();
    const profile = read(KEYS.profile, {});
    const current = select.value || profile?.focusDomain || items[0]?.id || '';
    select.innerHTML = '';
    items.forEach((journey) => {
      const option = document.createElement('option');
      option.value = journey.id;
      option.textContent = (journey.icon || '🧭') + ' ' + (journey.name || '旅');
      select.appendChild(option);
    });
    select.value = items.some((item) => item.id === current) ? current : items[0]?.id || '';
  }

  function renderStageOptions(selected) {
    const select = $('mapStage');
    if (!select) return;
    select.innerHTML = '';
    STAGES.forEach((stage) => {
      const option = document.createElement('option');
      option.value = stage;
      option.textContent = stage;
      option.selected = stage === selected;
      select.appendChild(option);
    });
  }

  function renderNeededOptions() {
    const select = $('mapNeededArchetype');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">まだ分からない／選ばない</option>';
    ARCHETYPES.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    });
    if (ARCHETYPE_IDS.has(current)) select.value = current;
  }

  function syncChoiceState() {
    document.querySelectorAll('[data-archetype-id]').forEach((button) => {
      button.setAttribute('aria-pressed', String(active.includes(button.dataset.archetypeId)));
    });
    if ($('activeArchetypeCount')) $('activeArchetypeCount').textContent = active.length + '/3';
  }

  function toggleArchetype(id) {
    if (active.includes(id)) active = active.filter((value) => value !== id);
    else if (active.length >= 3) {
      status('今前へ出ている力は最大3つです。外す力を1つ選んでください。');
      return;
    } else active = [...active, id];
    syncChoiceState();
  }

  function renderArchetypeChoices() {
    const box = $('archetypeChoices');
    const reference = $('archetypeReference');
    if (!box || !reference) return;
    box.innerHTML = '';
    reference.innerHTML = '';
    ARCHETYPES.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'archetype-choice';
      button.dataset.archetypeId = item.id;
      button.setAttribute('aria-pressed', String(active.includes(item.id)));
      const name = document.createElement('strong');
      name.textContent = item.name;
      const description = document.createElement('small');
      description.textContent = item.description;
      button.append(name, description);
      button.addEventListener('click', () => toggleArchetype(item.id));
      box.appendChild(button);

      const detail = document.createElement('article');
      detail.className = 'archetype-reference-item';
      const title = document.createElement('strong');
      title.textContent = item.name;
      const descriptionText = document.createElement('p');
      descriptionText.textContent = item.description;
      const light = document.createElement('p');
      light.textContent = '光：' + item.light;
      const shadow = document.createElement('p');
      shadow.textContent = '影：' + item.shadow;
      detail.append(title, descriptionText, light, shadow);
      reference.appendChild(detail);
    });
    renderNeededOptions();
    syncChoiceState();
  }

  function formatSceneDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '日時不明';
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo'
    }).format(date);
  }

  function renderLatestScene(journeyId) {
    const box = $('mapLatestScene');
    if (!box) return;
    const values = read(KEYS.scenes, []);
    const latest = (Array.isArray(values) ? values : [])
      .filter((scene) => scene?.domainId === journeyId && (scene?.fact || scene?.rawInput))
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))[0];
    box.innerHTML = '';
    if (!latest) {
      box.textContent = 'この旅で残したことはまだありません。';
      return;
    }
    const meta = document.createElement('small');
    meta.textContent = formatSceneDate(latest.occurredAt) + (latest.rawInput && !latest.fact ? ' · 本人の原文' : ' · 本人確認済みの事実');
    const text = document.createElement('strong');
    text.textContent = latest.fact || latest.rawInput;
    box.append(meta, text);
    [['感情', latest.feeling], ['選択', latest.choice], ['結果', latest.result], ['今の解釈', latest.reflection]].forEach(([label, value]) => {
      if (!value) return;
      const line = document.createElement('p');
      line.textContent = label + '：' + value;
      box.appendChild(line);
    });
  }

  function appendSummaryRow(parent, label, value) {
    if (!value) return false;
    const row = document.createElement('article');
    row.className = 'current-summary-row';
    const name = document.createElement('span');
    name.textContent = label;
    const text = document.createElement('strong');
    text.textContent = value;
    row.append(name, text);
    parent.appendChild(row);
    return true;
  }

  function renderCurrentLocationSummary(journey, archetypes) {
    const list = $('currentSummaryList');
    if (!list) return;
    $('currentJourneyIcon').textContent = journey?.icon || '🧭';
    $('currentJourneyName').textContent = journey?.name || 'まだありません';
    $('currentStageSummary').textContent = journey
      ? (journey.stageUnknown ? 'まだ決めていません' : (journey.stage || 'まだ決めていません'))
      : 'まだ決めていません';
    list.innerHTML = '';
    let count = 0;
    if (journey) {
      count += Number(appendSummaryRow(list, '次の一手', clean(journey.quest, 180)));
      count += Number(appendSummaryRow(list, '大切にしたいこと', clean(journey.compass, 180)));
      count += Number(appendSummaryRow(list, '自分で選べること', clean(journey.controllable, 400)));
      const names = archetypes.active
        .map((id) => ARCHETYPES.find((item) => item.id === id)?.name)
        .filter(Boolean)
        .join('、');
      count += Number(appendSummaryRow(list, '今前へ出ている力', names));
    }
    $('currentSummaryEmpty').hidden = count > 0;
  }

  function loadCurrentLocation() {
    const journey = selectedJourney();
    if (!journey) {
      renderCurrentLocationSummary(null, normalizeArchetypes(null));
      renderLatestScene('');
      return;
    }
    const reality = normalizeReality(journey.reality);
    const archetypes = normalizeArchetypes(journey.archetypes);
    renderStageOptions(STAGES.includes(journey.stage) ? journey.stage : STAGES[0]);
    $('mapStageUnknown').checked = Boolean(journey.stageUnknown);
    $('mapStage').disabled = Boolean(journey.stageUnknown);
    $('mapCompass').value = journey.compass || '';
    $('mapQuest').value = journey.quest || '';
    $('mapTreasure').value = journey.treasure || '';
    $('mapControllable').value = journey.controllable || '';
    $('mapRealityBody').value = reality.body;
    $('mapRealityMind').value = reality.mind;
    $('mapRealityTime').value = reality.time;
    $('mapRealityMoney').value = reality.money;
    $('mapRealityRelationships').value = reality.relationships;
    $('mapRealityEnvironment').value = reality.environment;
    active = archetypes.active;
    renderArchetypeChoices();
    $('mapNeededArchetype').value = archetypes.needed;
    $('mapArchetypeBalance').value = archetypes.balance;
    $('mapArchetypeNote').value = archetypes.note;
    syncChoiceState();
    renderCurrentLocationSummary(journey, archetypes);
    renderLatestScene(journey.id);
  }

  function saveCurrentLocation() {
    const items = journeys();
    const index = items.findIndex((item) => item.id === $('mapJourney').value);
    if (index < 0) { status('注目する旅を確認できませんでした。'); return; }
    const journey = items[index];
    items[index] = {
      ...journey,
      stage: STAGES.includes($('mapStage').value) ? $('mapStage').value : STAGES[0],
      stageUnknown: $('mapStageUnknown').checked,
      compass: clean($('mapCompass').value, 180),
      quest: clean($('mapQuest').value, 180),
      treasure: clean($('mapTreasure').value, 400),
      controllable: clean($('mapControllable').value, 400),
      reality: normalizeReality({
        body: $('mapRealityBody').value,
        mind: $('mapRealityMind').value,
        time: $('mapRealityTime').value,
        money: $('mapRealityMoney').value,
        relationships: $('mapRealityRelationships').value,
        environment: $('mapRealityEnvironment').value
      }),
      archetypes: normalizeArchetypes({
        active,
        needed: $('mapNeededArchetype').value,
        balance: $('mapArchetypeBalance').value,
        note: $('mapArchetypeNote').value
      }),
      updatedAt: new Date().toISOString()
    };
    const oldProfile = read(KEYS.profile, {});
    const profile = {
      ...(oldProfile && typeof oldProfile === 'object' ? oldProfile : {}),
      focusDomain: journey.id,
      updatedAt: new Date().toISOString()
    };
    if (!write(KEYS.journeys, items) || !write(KEYS.profile, profile)) {
      status('現在地を保存できませんでした。');
      return;
    }
    status('現在地と次の一手を保存しました。');
    window.dispatchEvent(new CustomEvent('hj:data-changed'));
    setTimeout(() => location.reload(), 180);
  }

  $('mapJourney')?.addEventListener('change', loadCurrentLocation);
  $('mapStageUnknown')?.addEventListener('change', () => { $('mapStage').disabled = $('mapStageUnknown').checked; });
  $('saveCurrentLocation')?.addEventListener('click', saveCurrentLocation);
  renderJourneyOptions();
  renderNeededOptions();
  loadCurrentLocation();
})();

