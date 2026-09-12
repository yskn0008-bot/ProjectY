'use strict';

const REQUIRED_SECTIONS = [
  'Summary',
  'Codex execution',
  'Scope',
  'Verification',
  'Readiness',
  'Remaining work'
];

const PLACEHOLDER_PATTERNS = [
  /^\s*$/u,
  /describe the user-visible result/i,
  /codex task reference or exception reason:\s*$/im,
  /assigned directory:\s*$/im,
  /files changed:\s*$/im,
  /commands and tests executed:\s*$/im,
  /results:\s*$/im,
  /list every manual check/i
];

function sectionMap(body) {
  const sections = new Map();
  const matches = [...String(body || '').matchAll(/^##\s+(.+?)\s*$/gmu)];
  for (let index = 0; index < matches.length; index += 1) {
    const title = matches[index][1].trim();
    const start = matches[index].index + matches[index][0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : body.length;
    sections.set(title, body.slice(start, end).trim());
  }
  return sections;
}

function fieldValue(section, label) {
  const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:\\s*(.+)$`, 'imu');
  const match = section.match(pattern);
  return match ? match[1].trim() : '';
}

function substantive(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^(?:tbd|todo|n\/a\??|none\??|未記入|未定|あとで)$/iu.test(text)) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

function checkedCount(section, labels) {
  return labels.reduce((count, label) => {
    const pattern = new RegExp(`^- \\[xX\\] ${label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`, 'mu');
    return count + (pattern.test(section) ? 1 : 0);
  }, 0);
}

function requireChecked(section, label, errors) {
  const pattern = new RegExp(`^- \\[xX\\] ${label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`, 'mu');
  if (!pattern.test(section)) errors.push(`Verification checkbox must be completed: ${label}`);
}

function readinessValue(section, label) {
  const pattern = new RegExp(`^- ${label}:\\s*(.+)$`, 'imu');
  const match = section.match(pattern);
  return match ? match[1].trim().toLowerCase() : '';
}

function validatePrEvidence(body) {
  const errors = [];
  const sections = sectionMap(String(body || ''));

  for (const title of REQUIRED_SECTIONS) {
    if (!sections.has(title)) {
      errors.push(`Missing required PR section: ## ${title}`);
      continue;
    }
    if (!substantive(sections.get(title))) errors.push(`PR section is empty or placeholder-only: ## ${title}`);
  }

  if (errors.some((error) => error.startsWith('Missing required PR section'))) return errors;

  const summary = sections.get('Summary');
  if (!substantive(summary) || summary.length < 24) errors.push('Summary must contain a substantive result and reason.');

  const codex = sections.get('Codex execution');
  const codexOptions = [
    'Used Codex for implementation',
    'Codex unavailable or blocked',
    'Approved exception: no code change / emergency rollback'
  ];
  const codexChecked = checkedCount(codex, codexOptions);
  if (codexChecked !== 1) errors.push('Exactly one Codex execution option must be checked.');
  const codexReason = fieldValue(codex, 'Codex task reference or exception reason');
  if (!substantive(codexReason)) errors.push('Codex task reference or exception reason must be filled.');

  const scope = sections.get('Scope');
  if (!substantive(fieldValue(scope, 'Assigned directory'))) errors.push('Assigned directory must be filled.');
  if (!substantive(fieldValue(scope, 'Files changed'))) errors.push('Files changed must be filled.');
  requireChecked(scope, 'No unintended files changed', errors);
  requireChecked(scope, 'No unapproved cross-scope changes', errors);

  const verification = sections.get('Verification');
  if (!substantive(fieldValue(verification, 'Commands and tests executed'))) errors.push('Commands and tests executed must be filled.');
  if (!substantive(fieldValue(verification, 'Results'))) errors.push('Verification results must be filled.');
  requireChecked(verification, 'Relevant automated checks pass', errors);
  requireChecked(verification, 'Final diff reviewed', errors);
  requireChecked(verification, 'Existing behavior regression checked', errors);

  const readiness = sections.get('Readiness');
  const allowedReadiness = {
    Code: new Set(['verified', 'unverified', 'not applicable']),
    Production: new Set(['verified', 'unverified', 'not applicable']),
    'iPhone Safari/PWA': new Set(['verified', 'unverified', 'not applicable'])
  };
  for (const [label, allowed] of Object.entries(allowedReadiness)) {
    const value = readinessValue(readiness, label);
    if (!allowed.has(value)) errors.push(`${label} readiness must select exactly one allowed value.`);
  }

  const remaining = sections.get('Remaining work').trim();
  if (!substantive(remaining)) errors.push('Remaining work must explicitly state incomplete work or "None".');

  return errors;
}

if (require.main === module) {
  const body = process.env.PR_BODY || '';
  const errors = validatePrEvidence(body);
  if (errors.length) {
    for (const error of errors) console.error(`::error::${error}`);
    process.exit(1);
  }
  console.log('Required PR evidence is substantive and internally selected.');
}

module.exports = {validatePrEvidence};
