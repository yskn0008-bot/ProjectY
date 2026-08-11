'use strict';

const fs = require('node:fs');

const ISSUE_NUMBER = 232;
const MARKER = '<!-- projecty-hq-event-state -->';
const UI_FILE = /^(taxi|life|yos|nav)\/(?:[^/]+\/)*(?:[^/]+\.(?:css|html)|final-app-v\d+\.js|[^/]*(?:style|theme|view|screen|component)[^/]*\.(?:js|cjs|mjs|ts|tsx|jsx))$/i;
const SENSITIVE_FILE = /(^|\/)(?:service-worker|sw)\.(?:js|cjs|mjs|ts)$|(^|\/)(?:auth|api|deploy|deployment|infrastructure|manifest)(?:\/|\.|-)|(^|\/)\.github\/|(?:^|\/)vercel\.json$/i;
const LOGIC_FILE = /\.(?:js|cjs|mjs|ts|tsx|jsx|py|rb|go|rs|java|swift)$/i;

function classifyQaLevel(body, files) {
  if (files.some((file) => SENSITIVE_FILE.test(file))) return 3;
  const explicitLevel1 = /(?:^|\n)\s*(?:QA\s*)?Level\s*1\b/im.test(body || '');
  if (explicitLevel1 && files.length > 0 && files.every((file) => UI_FILE.test(file))) return 1;
  if (files.some((file) => LOGIC_FILE.test(file))) return 2;
  return 2;
}

function nextStepForConclusion(conclusion) {
  if (conclusion === 'success') return 'QA成功。次工程はレビュー、必要な実機確認、マージ準備（自動マージなし）。';
  if (conclusion === 'failure') return 'QA失敗。次工程はログ確認後にCodexへ修正を依頼（自動起動なし）。';
  if (conclusion === 'cancelled') return 'QA取消。次工程は取消理由の確認と必要な再実行。';
  return `QA完了（${conclusion || 'unknown'}）。次工程は結果の確認。`;
}

function renderState(state) {
  return [
    MARKER,
    '## Issue #232 自動司令部の現在状態',
    '',
    `- PR: #${state.prNumber}`,
    `- current head: \`${state.headSha}\``,
    `- QA Level: Level ${state.level}`,
    `- trigger: \`${state.trigger}\``,
    `- 状態: ${state.status}`,
    `- 次工程: ${state.nextStep}`,
    '- 自動化範囲: PR更新検知、既存QA完了検知、current-head検証、単一状態コメント、意味ある変更後のMission Control同期。',
    '- 未実装・禁止: Codex自動起動、自動マージ、本番公開、製品コード変更、SE3 fan-out。',
    '- 実機確認: この自動化では未確認。',
  ].join('\n');
}

function chooseCommentMutation(comments, desiredBody) {
  const managed = comments.find((comment) => comment.body && comment.body.includes(MARKER));
  if (managed && managed.body === desiredBody) return { kind: 'none' };
  if (managed) return { kind: 'update', id: managed.id, body: desiredBody };
  return { kind: 'create', body: desiredBody };
}

function workflowRunState(run, pr) {
  if (!pr || !run || run.head_sha !== pr.head.sha) return null;
  return {
    prNumber: pr.number,
    headSha: pr.head.sha,
    level: null,
    trigger: `workflow_run:${run.name}`,
    status: `QA ${run.conclusion || 'unknown'}`,
    nextStep: nextStepForConclusion(run.conclusion),
  };
}

function apiClient(token, repository) {
  const root = `https://api.github.com/repos/${repository}`;
  async function request(path, options = {}) {
    const response = await fetch(`${root}${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }
  return { request };
}

async function getFiles(api, number) {
  const files = await api.request(`/pulls/${number}/files?per_page=100`);
  return files.map((file) => file.filename);
}

async function stateForPullRequest(api, pr, trigger) {
  const files = await getFiles(api, pr.number);
  const level = classifyQaLevel(pr.body || '', files);
  return {
    prNumber: pr.number,
    headSha: pr.head.sha,
    level,
    trigger,
    status: 'PR更新を検知。既存path trigger QAの結果待ち。',
    nextStep: level === 1
      ? '既存の対象path QAのみを確認（SE3・全回帰・Vercel・Service Worker監査の追加起動なし）。'
      : `Level ${level}として既存QAとレビュー結果を確認。`,
  };
}

async function readManagedComments(api) {
  return api.request(`/issues/${ISSUE_NUMBER}/comments?per_page=100`);
}

async function persistState(api, state, dryRun) {
  const body = renderState({ ...state, level: state.level || '未再判定' });
  const mutation = chooseCommentMutation(await readManagedComments(api), body);
  if (dryRun || mutation.kind === 'none') return mutation;
  if (mutation.kind === 'create') {
    await api.request(`/issues/${ISSUE_NUMBER}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
  } else {
    await api.request(`/issues/comments/${mutation.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
  }
  // GITHUB_TOKEN issue events do not recursively start workflows, so explicitly reuse the existing sync.
  await api.request('/actions/workflows/deploy-pages.yml/dispatches', {
    method: 'POST',
    body: JSON.stringify({ ref: 'main' }),
  });
  return mutation;
}

async function processEvent({ api, eventName, payload, dryRun }) {
  let state;
  if (eventName === 'pull_request') {
    state = await stateForPullRequest(api, payload.pull_request, `pull_request:${payload.action}`);
  } else if (eventName === 'workflow_run') {
    const run = payload.workflow_run;
    const linked = run.pull_requests && run.pull_requests[0];
    if (!linked) return { kind: 'ignored', reason: 'workflow run has no linked PR' };
    const pr = await api.request(`/pulls/${linked.number}`);
    state = workflowRunState(run, pr);
    if (!state) return { kind: 'ignored', reason: 'workflow run is not for the current PR head' };
    state.level = classifyQaLevel(pr.body || '', await getFiles(api, pr.number));
  } else {
    const prs = await api.request('/pulls?state=open&sort=updated&direction=desc&per_page=1');
    if (!prs.length) return { kind: 'ignored', reason: 'no open PR to audit' };
    if (eventName === 'schedule') {
      const managed = (await readManagedComments(api)).find((comment) => comment.body && comment.body.includes(MARKER));
      if (managed && managed.body.includes(`- current head: \`${prs[0].head.sha}\``)) {
        return { kind: 'none', reason: 'latest open PR head is already recorded' };
      }
    }
    state = await stateForPullRequest(api, prs[0], eventName === 'schedule' ? 'schedule:audit' : 'workflow_dispatch:audit');
  }
  return persistState(api, state, dryRun);
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.REPOSITORY;
  if (!token || !repository) throw new Error('GITHUB_TOKEN and REPOSITORY are required');
  let eventName = process.env.EVENT_NAME;
  let payload = JSON.parse(fs.readFileSync(process.env.EVENT_PATH, 'utf8'));
  const supplied = process.env.DISPATCH_EVENT_JSON;
  if (eventName === 'workflow_dispatch' && supplied) {
    payload = JSON.parse(supplied);
    eventName = payload.workflow_run ? 'workflow_run' : payload.pull_request ? 'pull_request' : eventName;
  }
  const result = await processEvent({
    api: apiClient(token, repository),
    eventName,
    payload,
    dryRun: process.env.DRY_RUN === 'true',
  });
  console.log(JSON.stringify(result));
}

module.exports = { MARKER, chooseCommentMutation, classifyQaLevel, processEvent, renderState, workflowRunState };

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
