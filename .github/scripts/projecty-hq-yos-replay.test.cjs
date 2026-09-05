'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findReplayTarget, replayCandidateKeys } = require('./projecty-hq-yos-replay.cjs');

const REPOSITORY = 'yskn0008-bot/ProjectY';
const OWNER = 'yskn0008-bot';
const HEAD = 'a'.repeat(40);

function ownerPr(number, head = HEAD, overrides = {}) {
  return {
    number,
    state: 'open',
    merged: false,
    user: { login: OWNER },
    author_association: 'OWNER',
    head: { sha: head, ref: `feature-${number}`, repo: { full_name: REPOSITORY } },
    ...overrides,
  };
}

test('replay candidates include only persisted NEEDS_YOS PR keys', () => {
  assert.deepEqual(replayCandidateKeys({ targets: {
    'PR#1': { phase: 'OBSERVING' },
    'PR#2': { phase: 'NEEDS_YOS' },
    'issue#3': { phase: 'NEEDS_YOS' },
  } }), ['PR#2']);
});

test('replay skips stale or unsafe targets and chooses a current owner PR', async () => {
  const state = { targets: {
    'PR#2': { phase: 'NEEDS_YOS', head: 'b'.repeat(40) },
    'PR#3': { phase: 'NEEDS_YOS', head: HEAD },
  } };
  const api = {
    async request(path) {
      if (path === '/pulls/2') return ownerPr(2, HEAD);
      if (path === '/pulls/3') return ownerPr(3, HEAD);
      throw new Error(`unexpected request ${path}`);
    },
  };
  assert.equal(await findReplayTarget({ api, state, repository: REPOSITORY, owner: OWNER }), 'PR#3');
});

test('replay refuses a fork, non-owner, closed PR, or moved head', async () => {
  const state = { targets: {
    'PR#2': { phase: 'NEEDS_YOS', head: HEAD },
    'PR#3': { phase: 'NEEDS_YOS', head: HEAD },
    'PR#4': { phase: 'NEEDS_YOS', head: HEAD },
    'PR#5': { phase: 'NEEDS_YOS', head: HEAD },
  } };
  const api = {
    async request(path) {
      if (path === '/pulls/2') return ownerPr(2, HEAD, { head: { sha: HEAD, ref: 'fork', repo: { full_name: 'other/fork' } } });
      if (path === '/pulls/3') return ownerPr(3, HEAD, { user: { login: 'other' } });
      if (path === '/pulls/4') return ownerPr(4, HEAD, { state: 'closed' });
      if (path === '/pulls/5') return ownerPr(5, 'c'.repeat(40));
      throw new Error(`unexpected request ${path}`);
    },
  };
  assert.equal(await findReplayTarget({ api, state, repository: REPOSITORY, owner: OWNER }), null);
});
