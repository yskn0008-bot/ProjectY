'use strict';
(() => {
  const STAGES = ['日常世界','冒険への誘い','ためらい','メンターとの出会い','最初の境界線','試練・仲間・敵','最も深い場所へ','最大の試練','報酬','帰路','復活','宝を持って帰還'];
  const ARCHETYPES = Array.isArray(globalThis.HJ_ARCHETYPES) ? globalThis.HJ_ARCHETYPES : [];
  const ARCHETYPE_IDS = new Set(ARCHETYPES.map((item) => item.id));
  const KEYS = {
    journeys: 'hj-domain-journeys-v1',
    stories: 'hj-weekly-stories-v1',
    profile: 'hj-user-profile-v1',
    scenes: 'hj-daily-scenes-v1'
  };
  const SCHEMA = 'hj-complete-backup-v2';
  const YOS_AI_PRODUCTION_URL = 'https://project-y-yos-ai.vercel.app';
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

  function textList(value, maximumItems = 20, maximumLength = 600) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => clean(item, maximumLength)).filter(Boolean).slice(0, maximumItems);
  }

  function normalizeCandidates(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      if (!item || typeof item !== 'object') return null;
      const type = clean(item.type, 40);
      const candidateValue = clean(item.value, 400);
      if (!type || !candidateValue) return null;
      return {
        type,
        value: candidateValue,
        status: ['candidate', 'confirmed', 'rejected', 'unknown'].includes(item.status) ? item.status : 'candidate',
        rawInputId: clean(item.rawInputId, 100),
        sourceIds: textList(item.sourceIds, 8, 200),
        evidence: textList(item.evidence, 10, 400)
      };
    }).filter(Boolean).slice(0, 20);
  }

  function normalizeScene(value) {
    if (!value || typeof value !== 'object') return null;
    const rawInput = clean(value.rawInput, 10000);
    const fact = clean(value.fact, 600);
    if (!fact && !rawInput) return null;
    const occurredAt = clean(value.occurredAt, 60);
    const date = new Date(occurredAt);
    return {
      id: clean(value.id, 100) || uid(),
      occurredAt: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
      domainId: clean(value.domainId, 100),
      stage: STAGES.includes(value.stage) ? value.stage : STAGES[0],
      fact,
      source: rawInput ? 'raw-input' : clean(value.source, 40),
      rawInput,
      confirmedFacts: textList(value.confirmedFacts, 20, 600),
      candidates: normalizeCandidates(value.candidates),
      evidence: textList(value.evidence, 20, 600),
      unknown: textList(value.unknown, 20, 80),
      conversationStatus: rawInput && ['draft', 'raw', 'sending', 'confirming', 'reviewed', 'confirmed', 'local-only', 'failed'].includes(value.conversationStatus) ? value.conversationStatus : '',
      aiAnswer: clean(value.aiAnswer, 4000),
      aiRequestId: clean(value.aiRequestId, 160),
      aiSafety: value.aiSafety && typeof value.aiSafety === 'object' ? {
        level: ['normal', 'attention', 'blocked'].includes(value.aiSafety.level) ? value.aiSafety.level : 'normal',
        notes: textList(value.aiSafety.notes, 10, 400)
      } : { level: 'normal', notes: [] },
      feeling: clean(value.feeling, 400),
      choice: clean(value.choice, 400),
      result: clean(value.result, 400),
      reflection: clean(value.reflection, 400),
      controllable: clean(value.controllable, 400),
      next: clean(value.next, 180),
      activeArchetypes: [...new Set((Array.isArray(value.activeArchetypes) ? value.activeArchetypes : []).filter((id) => ARCHETYPE_IDS.has(id)))].slice(0, 3),
      neededArchetype: ARCHETYPE_IDS.has(value.neededArchetype) ? value.neededArchetype : '',
      archetypeBalance: ['helping','overused','unknown'].includes(value.archetypeBalance) ? value.archetypeBalance : '',
      savedAt: clean(value.savedAt, 60) || new Date().toISOString()
    };
  }

  let scenes = read(KEYS.scenes, []).map(normalizeScene).filter(Boolean).slice(0, 500);
  let activeRawInputId = '';
  let activeAiSceneId = '';

  const candidateLabels = {
    fact: '事実として合ってる？',
    assumption: 'YOSの解釈は近い？',
    unknown: 'まだ分からないことで合ってる？',
    conflict: '食い違いがありそう？',
    nextAction: '次にこれをしてみる？',
    memory: '今後の参考に残す候補？'
  };

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

  function populateArchetypeSelects() {
    ['sceneArchetype1','sceneArchetype2','sceneArchetype3','sceneNeededArchetype'].forEach((id) => {
      const select = $(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">選ばない</option>';
      ARCHETYPES.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
      });
      if (ARCHETYPE_IDS.has(current)) select.value = current;
    });
  }

  function clearSceneForm() {
    $('sceneAt').value = localInputValue();
    $('sceneFact').value = '';
    $('sceneFeeling').value = '';
    $('sceneChoice').value = '';
    $('sceneResult').value = '';
    $('sceneReflection').value = '';
    $('sceneControllable').value = '';
    $('sceneNext').value = '';
    ['sceneArchetype1','sceneArchetype2','sceneArchetype3','sceneNeededArchetype','sceneArchetypeBalance'].forEach((id) => { if ($(id)) $(id).value = ''; });
    renderDomainOptions();
    populateArchetypeSelects();
  }

  function latestRawInput(draftOnly = false) {
    return scenes
      .filter((scene) => scene.rawInput && (!draftOnly || scene.conversationStatus === 'draft'))
      .sort((a, b) => new Date(b.savedAt || b.occurredAt) - new Date(a.savedAt || a.occurredAt))[0] || null;
  }

  function latestConfirmingScene() {
    return scenes
      .filter((scene) => scene.conversationStatus === 'confirming' && scene.candidates.some((item) => item.status === 'candidate'))
      .sort((a, b) => new Date(b.savedAt || b.occurredAt) - new Date(a.savedAt || a.occurredAt))[0] || null;
  }

  function focusedJourney() {
    const items = journeys();
    const profile = read(KEYS.profile, {});
    return items.find((item) => item.id === profile?.focusDomain) || items[0] || null;
  }

  function rawPreview(value) {
    const text = clean(value, 10000).replace(/\s+/g, ' ');
    return text.length > 90 ? text.slice(0, 90) + '…' : text;
  }

  function renderConversationHome() {
    const latest = latestRawInput(true);
    const resume = $('conversationResume');
    if (!resume) return;
    resume.hidden = !latest;
    $('startNewConversation').hidden = !latest;
    $('startConversation').textContent = latest ? '続きを話す' : '今のことを話す';
    if (latest) $('conversationResumeText').textContent = rawPreview(latest.rawInput);
  }

  function openConversation(scene = null) {
    hideAiReview();
    activeRawInputId = scene?.id || '';
    $('rawInput').value = scene?.rawInput || '';
    $('conversationComposer').hidden = false;
    $('rawSaved').hidden = true;
    $('conversationResume').hidden = true;
    $('startConversation').hidden = true;
    $('startNewConversation').hidden = true;
    $('rawDraftStatus').textContent = scene?.rawInput ? '前回の原文を開きました。変更内容も自動で残ります。' : '入力内容は自動で残ります。';
    $('conversationHome')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('rawInput')?.focus(), 120);
  }

  function saveRawInputDraft() {
    const rawInput = clean($('rawInput')?.value, 10000);
    if (!rawInput) return null;
    const now = new Date().toISOString();
    let index = activeRawInputId ? scenes.findIndex((scene) => scene.id === activeRawInputId) : -1;
    if (index < 0) {
      const focus = focusedJourney();
      const scene = normalizeScene({
        id: uid(),
        occurredAt: now,
        domainId: focus?.id || '',
        stage: STAGES.includes(focus?.stage) ? focus.stage : STAGES[0],
        fact: '',
        source: 'raw-input',
        rawInput,
        confirmedFacts: [],
        candidates: [],
        evidence: [],
        unknown: ['facts', 'feelings', 'meaning', 'stage', 'archetypes', 'next-step'],
        conversationStatus: 'draft',
        savedAt: now
      });
      scenes.unshift(scene);
      activeRawInputId = scene.id;
      index = 0;
    } else {
      scenes[index] = normalizeScene({
        ...scenes[index],
        rawInput,
        fact: scenes[index].fact || '',
        conversationStatus: 'draft',
        savedAt: now
      });
    }
    scenes = scenes.filter(Boolean).slice(0, 500);
    if (!write(KEYS.scenes, scenes)) {
      $('rawDraftStatus').textContent = '下書きを残せませんでした。';
      return null;
    }
    $('rawDraftStatus').textContent = '下書きを残しました。';
    renderConversationHome();
    return scenes.find((scene) => scene.id === activeRawInputId) || null;
  }

  const asCandidateText = (value) => {
    if (typeof value === 'string') return clean(value, 400);
    if (!value || typeof value !== 'object') return '';
    for (const key of ['text', 'statement', 'content', 'value', 'title', 'action', 'reason']) {
      const text = clean(value[key], 400);
      if (text) return text;
    }
    return '';
  };

  function sourceIdsOf(value) {
    if (!value || typeof value !== 'object') return [];
    const direct = Array.isArray(value.sourceIds) ? value.sourceIds : Array.isArray(value.evidenceSourceIds) ? value.evidenceSourceIds : [];
    const selected = clean(value.selected?.source?.id, 200);
    const alternatives = Array.isArray(value.alternatives)
      ? value.alternatives.map((item) => clean(item?.source?.id, 200)).filter(Boolean)
      : [];
    return [...new Set([...textList(direct, 8, 200), selected, ...alternatives].filter(Boolean))].slice(0, 8);
  }

  function mapAiCandidates(result, rawInputId) {
    const mapped = [];
    const add = (values, type) => (Array.isArray(values) ? values : []).forEach((value) => {
      const text = asCandidateText(value);
      if (!text) return;
      mapped.push({
        type,
        value: text,
        status: 'candidate',
        rawInputId,
        sourceIds: sourceIdsOf(value),
        evidence: []
      });
    });
    add(result?.facts, 'fact');
    add(result?.assumptions, 'assumption');
    add(result?.unknowns, 'unknown');
    add(result?.conflicts, 'conflict');
    if (result?.nextAction) add([result.nextAction], 'nextAction');
    add(result?.memoryCandidates, 'memory');
    return mapped.slice(0, 20);
  }

  const apiErrorMessage = (status) => ({
    400: '入力内容を確認してください。話した内容は端末に保存済みです。',
    401: 'GoogleでYOS AIへ接続してください。話した内容は端末に保存済みです。',
    403: 'この画面からは接続できません。話した内容は端末に保存済みです。',
    405: 'アプリ更新が必要です。話した内容は端末に保存済みです。',
    413: '入力が長すぎます。短くして再試行してください。話した内容は端末に保存済みです。',
    415: 'アプリ更新が必要です。話した内容は端末に保存済みです。',
    429: '少し時間を空けてください。話した内容は端末に保存済みです。',
    503: 'YOSへ接続できません。話した内容は端末に保存済みです。'
  }[status] || 'YOSへ接続できません。話した内容は端末に保存済みです。');

  function hideAiReview() {
    activeAiSceneId = '';
    if ($('aiReview')) $('aiReview').hidden = true;
  }

  function renderAiReview(scene = null) {
    const target = scene || scenes.find((item) => item.id === activeAiSceneId) || latestConfirmingScene();
    const panel = $('aiReview');
    if (!panel) return;
    const pending = target?.conversationStatus === 'confirming'
      ? target.candidates.filter((item) => item.status === 'candidate' && (!item.rawInputId || item.rawInputId === target.id))
      : [];
    const candidate = pending[0];
    const showAnswer = Boolean(target?.aiAnswer);
    panel.hidden = !target || (!candidate && !showAnswer);
    if (panel.hidden) {
      activeAiSceneId = '';
      return;
    }
    activeAiSceneId = target.id;
    $('yosAnswer').textContent = target.aiAnswer || '';
    $('yosAnswer').hidden = !showAnswer;
    const safetyNotes = target.aiSafety?.notes || [];
    $('yosSafety').textContent = safetyNotes.join(' ');
    $('yosSafety').hidden = target.aiSafety?.level === 'normal' || safetyNotes.length === 0;
    $('candidateQuestion').hidden = !candidate;
    $('candidateText').hidden = !candidate;
    $('candidateActions').hidden = !candidate;
    $('candidateProgress').hidden = !candidate;
    if (!candidate) return;
    $('candidateQuestion').textContent = candidateLabels[candidate.type] || 'この整理は合ってる？';
    $('candidateText').textContent = candidate.value;
    $('candidateProgress').textContent = `未確認 ${pending.length}件`;
  }

  function currentLocationForAi() {
    const focus = focusedJourney();
    if (!focus) return undefined;
    return clean(`${focus.name || ''}${focus.stage ? `｜${focus.stage}` : ''}`, 300) || undefined;
  }

  async function requestAiForScene(sceneId) {
    const startIndex = scenes.findIndex((scene) => scene.id === sceneId);
    if (startIndex < 0 || !scenes[startIndex].rawInput) return;
    const rawInput = scenes[startIndex].rawInput;
    scenes[startIndex] = normalizeScene({
      ...scenes[startIndex],
      candidates: [],
      evidence: [],
      aiAnswer: '',
      aiRequestId: '',
      aiSafety: { level: 'normal', notes: [] },
      conversationStatus: 'sending',
      savedAt: new Date().toISOString()
    });
    if (!write(KEYS.scenes, scenes)) return;
    hideAiReview();
    $('rawSaved').hidden = false;
    $('rawSavedTitle').textContent = '話した内容を、そのまま残しました。';
    $('rawSavedMessage').textContent = 'YOSへ接続しています。';

    const baseUrl = typeof globalThis.YOS_AI_BASE_URL === 'string' && globalThis.YOS_AI_BASE_URL.trim()
      ? globalThis.YOS_AI_BASE_URL.trim()
      : YOS_AI_PRODUCTION_URL;
    const getToken = globalThis.YOS_AUTH?.getGoogleIdToken;
    const Client = globalThis.YosAiClient;
    if (typeof getToken !== 'function' || typeof Client !== 'function') {
      const index = scenes.findIndex((scene) => scene.id === sceneId);
      if (index >= 0) scenes[index] = normalizeScene({ ...scenes[index], conversationStatus: 'local-only', savedAt: new Date().toISOString() });
      write(KEYS.scenes, scenes);
      $('rawSavedMessage').textContent = 'YOS AIはまだ利用できません。原文は端末に保存済みです。';
      return;
    }

    try {
      const client = new Client({ baseUrl, getGoogleIdToken: getToken });
      const result = await client.chat({ userText: rawInput, currentLocation: currentLocationForAi() });
      const index = scenes.findIndex((scene) => scene.id === sceneId);
      if (index < 0 || scenes[index].rawInput !== rawInput || scenes[index].conversationStatus !== 'sending') return;
      const candidates = mapAiCandidates(result, sceneId);
      const evidence = [...new Set(candidates.flatMap((item) => item.sourceIds))].slice(0, 20);
      scenes[index] = normalizeScene({
        ...scenes[index],
        candidates,
        evidence,
        aiAnswer: clean(result?.answer, 4000),
        aiRequestId: clean(result?.requestId, 160),
        aiSafety: result?.safety,
        conversationStatus: candidates.length ? 'confirming' : 'reviewed',
        savedAt: new Date().toISOString()
      });
      if (!write(KEYS.scenes, scenes)) {
        $('rawSavedMessage').textContent = 'AIの整理を端末へ残せませんでした。原文は保存済みです。';
        return;
      }
      $('rawSavedMessage').textContent = candidates.length
        ? 'YOSの整理を受け取りました。1つだけ確認してください。'
        : 'YOSから返事が届きました。確認が必要な候補はありません。';
      renderAiReview(scenes[index]);
      renderScenes();
    } catch (error) {
      const index = scenes.findIndex((scene) => scene.id === sceneId);
      if (index >= 0) {
        scenes[index] = normalizeScene({
          ...scenes[index],
          candidates: [],
          evidence: [],
          aiAnswer: '',
          aiRequestId: '',
          conversationStatus: 'failed',
          savedAt: new Date().toISOString()
        });
        write(KEYS.scenes, scenes);
      }
      hideAiReview();
      $('rawSavedMessage').textContent = apiErrorMessage(Number(error?.status) || 0);
      renderScenes();
    }
  }

  function decideAiCandidate(decision) {
    const index = scenes.findIndex((scene) => scene.id === activeAiSceneId && scene.conversationStatus === 'confirming');
    if (index < 0) return;
    const scene = scenes[index];
    const candidate = scene.candidates.find((item) => item.status === 'candidate' && (!item.rawInputId || item.rawInputId === scene.id));
    if (!candidate) return;
    candidate.status = decision === 'yes' ? 'confirmed' : decision === 'unknown' ? 'unknown' : 'rejected';
    if (decision === 'yes' && candidate.type === 'fact' && !scene.confirmedFacts.includes(candidate.value)) {
      scene.confirmedFacts.push(candidate.value);
      if (!scene.fact) scene.fact = candidate.value;
    }
    if (decision === 'yes' && candidate.type === 'nextAction') {
      scene.next = candidate.value;
      const items = journeys();
      const journey = items.find((item) => item.id === scene.domainId);
      if (journey) {
        journey.quest = candidate.value;
        journey.updatedAt = new Date().toISOString();
        write(KEYS.journeys, items);
      }
    }
    if (decision === 'unknown' && !scene.unknown.includes(candidate.value)) scene.unknown.push(candidate.value);
    const pending = scene.candidates.some((item) => item.status === 'candidate' && (!item.rawInputId || item.rawInputId === scene.id));
    scenes[index] = normalizeScene({
      ...scene,
      conversationStatus: pending ? 'confirming' : 'confirmed',
      savedAt: new Date().toISOString()
    });
    if (!write(KEYS.scenes, scenes)) {
      setStatus('確認結果を保存できませんでした。');
      return;
    }
    renderAiReview(scenes[index]);
    renderScenes();
    setStatus(pending ? '次の候補を確認してください。' : 'YOSの候補確認が終わりました。');
  }

  async function finishRawInput() {
    const saved = saveRawInputDraft();
    if (!saved) {
      $('rawDraftStatus').textContent = 'まず、今のことをそのまま話してください。';
      $('rawInput')?.focus();
      return;
    }
    const index = scenes.findIndex((scene) => scene.id === saved.id);
    scenes[index] = normalizeScene({
      ...scenes[index],
      candidates: [],
      evidence: [],
      aiAnswer: '',
      aiRequestId: '',
      aiSafety: { level: 'normal', notes: [] },
      conversationStatus: 'raw',
      savedAt: new Date().toISOString()
    });
    if (!write(KEYS.scenes, scenes)) {
      $('rawDraftStatus').textContent = '本人の原文を残せませんでした。';
      return;
    }
    const savedId = saved.id;
    activeRawInputId = '';
    $('conversationComposer').hidden = true;
    $('startConversation').hidden = false;
    $('rawSaved').hidden = false;
    renderConversationHome();
    renderScenes();
    $('rawSavedTitle').textContent = '話した内容を、そのまま残しました。';
    $('rawSavedMessage').textContent = 'YOSへ接続しています。';
    setStatus('本人の原文を、そのまま残しました。');
    await requestAiForScene(savedId);
  }

  function openDetail(tab, targetId) {
    const details = $('hjDetails');
    if (details) details.open = true;
    ['currentLocationEditor', 'journeyEditor', 'sceneEditor', 'storyEditor'].forEach((id) => {
      const editor = $(id);
      if (editor) editor.open = false;
    });
    document.querySelector(`[data-tab="${tab}"]`)?.click();
    requestAnimationFrame(() => $(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function saveScene() {
    const fact = clean($('sceneFact').value, 600);
    if (!fact) {
      setStatus('実際に起きたことを一文だけ入力してください。');
      $('sceneFact').focus();
      return;
    }
    const occurredAt = new Date($('sceneAt').value || Date.now());
    const activeArchetypes = [...new Set(['sceneArchetype1','sceneArchetype2','sceneArchetype3'].map((id) => $(id)?.value).filter((id) => ARCHETYPE_IDS.has(id)))].slice(0, 3);
    const scene = normalizeScene({
      id: uid(),
      occurredAt: occurredAt.toISOString(),
      domainId: $('sceneDomain').value,
      stage: $('sceneStage').value,
      fact,
      feeling: $('sceneFeeling').value,
      choice: $('sceneChoice').value,
      result: $('sceneResult').value,
      reflection: $('sceneReflection').value,
      controllable: $('sceneControllable').value,
      next: $('sceneNext').value,
      activeArchetypes,
      neededArchetype: $('sceneNeededArchetype').value,
      archetypeBalance: $('sceneArchetypeBalance').value,
      savedAt: new Date().toISOString()
    });
    scenes.unshift(scene);
    scenes = scenes.slice(0, 500);
    if (!write(KEYS.scenes, scenes)) {
      setStatus('シーンを保存できませんでした。');
      return;
    }
    if (scene.next) {
      const items = journeys();
      const journey = items.find((item) => item.id === scene.domainId);
      if (journey) {
        journey.quest = scene.next;
        journey.updatedAt = new Date().toISOString();
        write(KEYS.journeys, items);
      }
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
      const metaValues = [formatSceneDate(scene.occurredAt), `${domain?.icon || '🧭'} ${domain?.name || '未設定'}`];
      metaValues.push(scene.rawInput && !scene.fact ? 'Raw Input' : scene.stage);
      metaValues.forEach((text) => {
        const chip = document.createElement('span');
        chip.textContent = text;
        meta.appendChild(chip);
      });
      article.appendChild(meta);

      const title = document.createElement('h3');
      title.textContent = scene.fact || scene.rawInput;
      article.appendChild(title);
      if (scene.confirmedFacts.length) appendDetail(article, '本人確認済みの事実', scene.confirmedFacts.join('\n'));
      appendDetail(article, '感情', scene.feeling);
      appendDetail(article, '選んだこと', scene.choice);
      appendDetail(article, '結果', scene.result);
      appendDetail(article, '今の解釈', scene.reflection);
      appendDetail(article, '自分で選べること', scene.controllable);
      appendDetail(article, '次の一手', scene.next);
      const archetypeNames = scene.activeArchetypes.map((id) => ARCHETYPES.find((item) => item.id === id)?.name).filter(Boolean);
      appendDetail(article, '前へ出ていた力', archetypeNames.join('、'));
      appendDetail(article, '必要だった力', ARCHETYPES.find((item) => item.id === scene.neededArchetype)?.name || '');

      if (scene.rawInput && !scene.fact && scene.conversationStatus === 'draft') {
        const resume = document.createElement('button');
        resume.className = 'scene-continue';
        resume.type = 'button';
        resume.textContent = '続きを話す';
        resume.addEventListener('click', () => openConversation(scene));
        article.appendChild(resume);
      }

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
    const items = currentWeekScenes().filter((scene) => scene.fact);
    if (!items.length) {
      setStatus('今週の本人確認済みの事実はまだありません。本人の原文は、そのまま安全に残っています。');
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
    if ($('storyEditor')) $('storyEditor').open = true;
    $('storyEditor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus(`${items.length}件の事実を「今週の物語」へまとめました。内容を確認してから作品化してください。`);
  }

  function activateSceneTab() {
    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === 'scenes');
    });
    $('journeysPanel')?.classList.remove('active');
    $('storyPanel')?.classList.remove('active');
    $('scenePanel')?.classList.add('active');
    if ($('sceneEditor')) $('sceneEditor').open = false;
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
  $('startConversation')?.addEventListener('click', () => openConversation(latestRawInput(true)));
  $('startNewConversation')?.addEventListener('click', () => openConversation());
  $('rawInput')?.addEventListener('input', saveRawInputDraft);
  $('finishRawInput')?.addEventListener('click', finishRawInput);
  document.querySelectorAll('[data-ai-decision]').forEach((button) => {
    button.addEventListener('click', () => decideAiCandidate(button.dataset.aiDecision));
  });
  $('openCurrentLocation')?.addEventListener('click', () => openDetail('journeys', 'currentLocationSection'));
  $('openPastStories')?.addEventListener('click', () => openDetail('story', 'storyHistorySection'));
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
  populateArchetypeSelects();
  renderScenes();
  renderConversationHome();
  renderAiReview();
})();
