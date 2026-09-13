'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {validatePrEvidence} = require('./validate-pr-evidence.cjs');

const validBody = `## Summary

Tighten governance so placeholder-only PR evidence cannot be accepted as complete.

## Codex execution

- [ ] Used Codex for implementation
- [x] Codex unavailable or blocked
- [ ] Approved exception: no code change / emergency rollback

Codex task reference or exception reason: No Codex execution surface is available in this runtime; YOS used the documented fallback.

## Scope

Assigned directory: .github/workflows/**, .github/scripts/**

Files changed: codex-governance.yml, validate-pr-evidence.cjs, validate-pr-evidence.test.cjs

- [x] No unintended files changed
- [x] No unapproved cross-scope changes

## Verification

Commands and tests executed: node --test .github/scripts/validate-pr-evidence.test.cjs

Results: all governance validator cases passed on the current head.

- [x] Relevant automated checks pass
- [x] Final diff reviewed
- [x] Existing behavior regression checked

## Readiness

- Code: verified
- Production: not applicable
- iPhone Safari/PWA: not applicable

## Remaining work

None after current-head governance CI is green and the final diff is rechecked.
`;

test('accepts complete substantive evidence', () => {
  assert.deepEqual(validatePrEvidence(validBody), []);
});

test('rejects untouched template placeholders', () => {
  const template = `## Summary

Describe the user-visible result and why this change is needed.

## Codex execution

- [ ] Used Codex for implementation
- [ ] Codex unavailable or blocked
- [ ] Approved exception: no code change / emergency rollback

Codex task reference or exception reason:

## Scope

Assigned directory:

Files changed:

- [ ] No unintended files changed
- [ ] No unapproved cross-scope changes

## Verification

Commands and tests executed:

Results:

- [ ] Relevant automated checks pass
- [ ] Final diff reviewed
- [ ] Existing behavior regression checked

## Readiness

- Code: verified / unverified
- Production: verified / unverified / not applicable
- iPhone Safari/PWA: verified / unverified / not applicable

## Remaining work

List every manual check, deployment step, external setting, or follow-up that is still incomplete.`;
  const errors = validatePrEvidence(template);
  assert.ok(errors.length >= 8, errors.join('\n'));
});

test('rejects headings plus keyword stuffing without completed evidence', () => {
  const body = validBody
    .replace('- [x] Codex unavailable or blocked', '- [ ] Codex unavailable or blocked')
    .replace('Assigned directory: .github/workflows/**, .github/scripts/**', 'Assigned directory:')
    .replace('- [x] Relevant automated checks pass', '- [ ] Relevant automated checks pass')
    .replace('- Code: verified', '- Code: verified / unverified');
  const errors = validatePrEvidence(body);
  assert.ok(errors.some((value) => value.includes('Exactly one Codex')));
  assert.ok(errors.some((value) => value.includes('Assigned directory')));
  assert.ok(errors.some((value) => value.includes('Relevant automated checks pass')));
  assert.ok(errors.some((value) => value.includes('Code readiness')));
});

test('rejects missing required section', () => {
  const errors = validatePrEvidence(validBody.replace(/## Verification[\s\S]*?## Readiness/u, '## Readiness'));
  assert.ok(errors.some((value) => value.includes('## Verification')));
});
