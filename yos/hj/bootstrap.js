"use strict";
(() => {
  const KEY = 'hj-domain-journeys-v1';
  const STAGES = ['日常世界','冒険への誘い','ためらい','メンターとの出会い','最初の境界線','試練・仲間・敵','最も深い場所へ','最大の試練','報酬','帰路','復活','宝を持って帰還'];
  const ARCHETYPE_IDS = new Set((globalThis.HJ_ARCHETYPES || []).map((item) => item.id));
  const text = (value, max) => String(value ?? '').replace(/[<>"'`]/g, '').trim().slice(0, max);
  const defaults = ['work','life','money','relations','dream'].map((id, index) => ({
    id,
    name: ['仕事','生活','お金','人間関係','夢・挑戦'][index],
    icon: ['💼','🏠','¥','🤝','✨'][index],
    stage: STAGES[0], stageUnknown: true, cycle: 1, theme: '', updatedAt: ''
  }));
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
  function reality(value) {
    const source = value && typeof value === 'object' ? value : {};
    return { body:text(source.body,120), mind:text(source.mind,120), time:text(source.time,120), money:text(source.money,120), relationships:text(source.relationships,120), environment:text(source.environment,120) };
  }
  function archetypes(value) {
    const source = value && typeof value === 'object' ? value : {};
    const active = Array.isArray(source.active) ? source.active : [];
    return {
      active:[...new Set(active.filter((id) => ARCHETYPE_IDS.has(id)))].slice(0,3),
      needed:ARCHETYPE_IDS.has(source.needed) ? source.needed : '',
      balance:['helping','overused','unknown'].includes(source.balance) ? source.balance : '',
      note:text(source.note,400)
    };
  }
  function normalize() {
    const current = read();
    if (!Array.isArray(current) || !current.length) { localStorage.setItem(KEY, JSON.stringify(defaults)); return defaults; }
    const safe = current.map((journey, index) => ({
      id:text(journey?.id,100) || 'journey-' + (index + 1),
      name:text(journey?.name,24) || '旅',
      icon:text(journey?.icon,4) || '🧭',
      stage:STAGES.includes(journey?.stage) ? journey.stage : STAGES[0],
      stageUnknown:Boolean(journey?.stageUnknown),
      cycle:Math.max(1,Math.min(99,+journey?.cycle || 1)),
      theme:text(journey?.theme,160),
      compass:text(journey?.compass,180),
      quest:text(journey?.quest,180),
      treasure:text(journey?.treasure,400),
      controllable:text(journey?.controllable,400),
      reality:reality(journey?.reality),
      archetypes:archetypes(journey?.archetypes),
      updatedAt:text(journey?.updatedAt,60)
    }));
    localStorage.setItem(KEY, JSON.stringify(safe));
    return safe;
  }
  normalize();
  document.getElementById('editProfile')?.addEventListener('click', normalize, true);
  document.getElementById('onboardingForm')?.addEventListener('submit', () => {
    const journeys = normalize(), domain = document.getElementById('profileDomain')?.value, stage = document.getElementById('profileStage')?.value;
    const item = journeys.find((journey) => journey.id === domain);
    if (item?.stage === STAGES[STAGES.length - 1] && stage === STAGES[0]) {
      item.cycle = Math.min(99, (+item.cycle || 1) + 1);
      localStorage.setItem(KEY, JSON.stringify(journeys));
    }
  }, true);
  document.addEventListener('click', (event) => {
    if (event.target?.dataset?.role !== 'save') return;
    const card = event.target.closest('.journey-card'), cards = [...document.querySelectorAll('.journey-card')], index = cards.indexOf(card);
    const journeys = normalize(), before = journeys[index], stage = card?.querySelector('[data-role="stage"]')?.value, cycle = card?.querySelector('[data-role="cycle"]');
    if (before?.stage === STAGES[STAGES.length - 1] && stage === STAGES[0] && cycle && (+cycle.value || 1) <= +before.cycle) cycle.value = Math.min(99, (+before.cycle || 1) + 1);
  }, true);
})();

