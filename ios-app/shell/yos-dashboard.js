const $ = (id) => document.getElementById(id);

const statusLabel = {
  planned: '予定',
  building: '開発中',
  awaiting_device_verification: '実機確認待ち',
  awaiting_production_verification: '運用確認待ち',
  blocked: '停止中',
  complete: '完成'
};

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function sortAssets(assets) {
  return [...assets].sort((a, b) => a.priority - b.priority || b.needs_user_action - a.needs_user_action || a.name.localeCompare(b.name, 'ja'));
}

function sortTasks(tasks) {
  return [...tasks].filter((task) => !task.completed && task.status !== 'completed')
    .sort((a, b) => a.priority - b.priority || a.task.localeCompare(b.task, 'ja'));
}

function renderAsset(asset) {
  const blocker = asset.blocker ? `<p class="meta danger">障害：${escapeHtml(asset.blocker)}</p>` : '';
  return `<article class="asset-card">
    <div class="asset-head"><div><span class="priority">P${asset.priority}</span><strong>${escapeHtml(asset.name)}</strong></div><b>${asset.progress}%</b></div>
    <div class="progress"><span style="width:${Math.max(0, Math.min(100, asset.progress))}%"></span></div>
    <p class="status">${statusLabel[asset.status] || escapeHtml(asset.status)}</p>
    <p class="meta"><b>現在地</b> ${escapeHtml(asset.current)}</p>
    <p class="meta"><b>次</b> ${escapeHtml(asset.next_action)}</p>
    ${blocker}
    <p class="updated">更新 ${escapeHtml(asset.updated_at)}</p>
  </article>`;
}

function renderTask(task) {
  return `<article class="task-card">
    <div class="asset-head"><span class="priority">P${task.priority}</span><strong>${escapeHtml(task.task)}</strong><b>${escapeHtml(task.estimated_time || '')}</b></div>
    <p class="meta"><b>対象</b> ${escapeHtml(task.project)}</p>
    <p class="meta"><b>本人限定の理由</b> ${escapeHtml(task.why_user_only)}</p>
    <p class="action"><b>やること</b> ${escapeHtml(task.exact_action)}</p>
    <p class="updated">元チャット：${escapeHtml(task.source_chat)} / ${escapeHtml(task.status)}</p>
  </article>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

async function init() {
  try {
    const [assetData, taskData] = await Promise.all([
      loadJson('./data/yos-assets.json'),
      loadJson('./data/yos-user-tasks.json')
    ]);
    const assets = sortAssets(assetData.assets || []);
    const tasks = sortTasks(taskData.tasks || []);
    const topAsset = assets[0];
    const topTask = tasks[0];

    $('development-progress').textContent = `${assetData.summary?.overall_progress ?? 0}%`;
    $('asset-progress').textContent = `${assetData.summary?.overall_progress ?? 0}%`;
    $('waiting-count').textContent = String(tasks.length);
    $('now-task').textContent = topTask ? topTask.task : '現在なし';
    $('next-action').textContent = topTask ? topTask.exact_action : (topAsset?.next_action || '次の本人操作はまだありません');
    $('asset-list').innerHTML = assets.map(renderAsset).join('');
    $('task-list').innerHTML = tasks.length ? tasks.map(renderTask).join('') : '<div class="empty">現在、本人にしかできないChatGPT内操作はありません。AI側の作業を先に進めます。</div>';
    $('data-state').textContent = `SSOT更新 ${assetData.updated_at}`;
  } catch (error) {
    $('data-state').textContent = `SSOT読込エラー：${error.message}`;
    $('data-state').classList.add('danger');
  }
}

init();
