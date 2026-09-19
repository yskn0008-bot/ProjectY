'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {validatePrEvidence} = require('./validate-pr-evidence.cjs');

const validBody = `## Summary

Tighten governance so placeholder-only PR evidence cannot be accepted as complete.

## Implementation route / cost control

- [x] One Enter / ChatGPT / GitHub / Factory used directly (default)
- [ ] Codex used because direct route was insufficient
- [ ] No implementation change / emergency rollback

Implementation route: One Enter used the connected GitHub tools directly.
Codex reason (required only when Codex selected): not applicable.

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

## Implementation route / cost control

- [ ] One Enter / ChatGPT / GitHub / Factory used directly (default)
- [ ] Codex used because direct route was insufficient
- [ ] No implementation change / emergency rollback

Implementation route:
Codex reason (required only when Codex selected):

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
    .replace('- [x] One Enter / ChatGPT / GitHub / Factory used directly (default)', '- [ ] One Enter / ChatGPT / GitHub / Factory used directly (default)')
    .replace('Assigned directory: .github/workflows/**, .github/scripts/**', 'Assigned directory:')
    .replace('- [x] Relevant automated checks pass', '- [ ] Relevant automated checks pass')
    .replace('- Code: verified', '- Code: verified / unverified');
  const errors = validatePrEvidence(body);
  assert.ok(errors.some((value) => value.includes('Exactly one implementation-route')));
  assert.ok(errors.some((value) => value.includes('Assigned directory')));
  assert.ok(errors.some((value) => value.includes('Relevant automated checks pass')));
  assert.ok(errors.some((value) => value.includes('Code readiness')));
});


test('requires a concrete reason before Codex can be selected', () => {
  const body = validBody
    .replace('- [x] One Enter / ChatGPT / GitHub / Factory used directly (default)', '- [ ] One Enter / ChatGPT / GitHub / Factory used directly (default)')
    .replace('- [ ] Codex used because direct route was insufficient', '- [x] Codex used because direct route was insufficient')
    .replace('Codex reason (required only when Codex selected): not applicable.', 'Codex reason (required only when Codex selected):');
  const errors = validatePrEvidence(body);
  assert.ok(errors.some((value) => value.includes('Codex reason is required')));
});

test('accepts legacy PR bodies without forcing migration', () => {
  const legacy = validBody
    .replace('## Implementation route / cost control', '## Codex execution')
    .replace('- [x] One Enter / ChatGPT / GitHub / Factory used directly (default)\n- [ ] Codex used because direct route was insufficient\n- [ ] No implementation change / emergency rollback\n\nImplementation route: One Enter used the connected GitHub tools directly.\nCodex reason (required only when Codex selected): not applicable.',
      '- [ ] Used Codex for implementation\n- [x] Codex not required; One Enter / ChatGPT / Factory used\n- [ ] Codex unavailable or blocked\n- [ ] Approved exception: no code change / emergency rollback\n\nImplementation route / Codex reference: One Enter used the connected GitHub tools directly; Codex was not needed.');
  assert.deepEqual(validatePrEvidence(legacy), []);
});

test('rejects missing required section', () => {
  const errors = validatePrEvidence(validBody.replace(/## Verification[\s\S]*?## Readiness/u, '## Readiness'));
  assert.ok(errors.some((value) => value.includes('## Verification')));
});
