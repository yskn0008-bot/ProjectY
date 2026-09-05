'use strict';

const { isTarget, parseRecovery } = require('./projecty-hq-autopilot.cjs');
const { apiClient, paginate, run: runDecision } = require('./projecty-hq-yos-decision.cjs');

const ISSUE_NUMBER = 232;

function replayCandidateKeys(state) {
  return Object.entries(state?.targets || {})
    .filter(([key, target]) => /^PR#[1-9][0-9]*$/.test(key) && target?.phase === 'NEEDS_YOS')
    .map(([key]) => key);
}

async function findReplayTarget({ api, state, repository, owner }) {
  for (const key of replayCandidateKeys(state)) {
    const number = Number(key.slice(3));
    const pr = await api.request(`/pulls/${number}`);
    const target = state.targets[key];
    if (isTarget(pr, repository, owner) && pr.head?.sha === target.head) return key;
  }
  return null;
}

async function replay({ api, fetchImpl = fetch, environment = process.env, endpoint }) {
  const repository = environment.REPOSITORY;
  if (!repository) throw new Error('REPOSITORY is required');
  const comments = await paginate(api, `/issues/${ISSUE_NUMBER}/comments`);
  const state = parseRecovery(comments);
  const target = await findReplayTarget({
    api,
    state,
    repository,
    owner: repository.split('/')[0],
  });
  if (!target) return { status: 'ignored', reason: 'no safe existing NEEDS_YOS target' };
  return runDecision({ api, fetchImpl, environment, ...(endpoint ? { endpoint } : {}), target });
}

async function main() {
  const repository = process.env.REPOSITORY;
  if (!process.env.GITHUB_TOKEN || !repository) throw new Error('GITHUB_TOKEN and REPOSITORY are required');
  const result = await replay({ api: apiClient(process.env.GITHUB_TOKEN, repository) });
  console.log(JSON.stringify(result));
}

module.exports = { findReplayTarget, replay, replayCandidateKeys };

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ level: 'error', event: 'projecty_yos_replay_failed', message: String(error.message || error).slice(0, 300) }));
  process.exitCode = 1;
});
