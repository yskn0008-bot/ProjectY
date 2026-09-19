'use strict';

const REQUIRED_SECTIONS = [
  'Summary',
  'Scope',
  'Verification',
  'Readiness',
  'Remaining work'
];

const ROUTE_SECTION = 'Implementation route / cost control';
const LEGACY_ROUTE_SECTION = 'Codex execution';

const PLACEHOLDER_PATTERNS = [
  /^\s*$/u,
  /describe the user-visible result/i,
  /list every manual check/i
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sectionMap(body) {
  const text = String(body || '');
  const sections = new Map();
  const matches = [...text.matchAll(/^##\s+(.+?)\s*$/gmu)];
  for (let index = 0; index < matches.length; index += 1) {
    const title = matches[index][1].trim();
    const start = matches[index].index + matches[index][0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    sections.set(title, text.slice(start, end).trim());
  }
  return sections;
}

function fieldValue(section, label) {
  const pattern = new RegExp(`^${escapeRegExp(label)}[ \\t]*:[ \\t]*(.*)$`, 'imu');
  const match = String(section || '').match(pattern);
  return match ? match[1].trim() : '';
}

function substantive(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^(?:tbd|todo|n\/a\??|none\??|未記入|未定|あとで)$/iu.test(text)) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

function checked(section, label) {
  const pattern = new RegExp(`^- \\[[xX]\\] ${escapeRegExp(label)}[ \\t]*$`, 'mu');
  return pattern.test(String(section || ''));
}

function checkedCount(section, labels) {
  return labels.reduce((count, label) => count + (checked(section, label) ? 1 : 0), 0);
}

function requireChecked(section, label, errors) {
  if (!checked(section, label)) errors.push(`Verification checkbox must be completed: ${label}`);
}

function readinessValue(section, label) {
  const pattern = new RegExp(`^- ${escapeRegExp(label)}:[ \\t]*(.+)$`, 'imu');
  const match = String(section || '').match(pattern);
  return match ? match[1].trim().toLowerCase() : '';
}

function validatePrEvidence(body) {
  const errors = [];
  const sections = sectionMap(body);

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

  const route = sections.get(ROUTE_SECTION);
  const legacyRoute = sections.get(LEGACY_ROUTE_SECTION);
  if (!route && !legacyRoute) {
    errors.push(`Missing required PR section: ## ${ROUTE_SECTION}`);
  } else if (route) {
    const routeOptions = [
      'One Enter / ChatGPT / GitHub / Factory used directly (default)',
      'Codex used because direct route was insufficient',
      'No implementation change / emergency rollback'
    ];
    if (checkedCount(route, routeOptions) !== 1) errors.push('Exactly one implementation-route option must be checked.');
    if (!substantive(fieldValue(route, 'Implementation route'))) {
      errors.push('Implementation route must be filled.');
    }
    if (checked(route, 'Codex used because direct route was insufficient')
      && !substantive(fieldValue(route, 'Codex reason (required only when Codex selected)'))) {
      errors.push('Codex reason is required when Codex is selected.');
    }
  } else {
    const codexOptions = [
      'Used Codex for implementation',
      'Codex not required; One Enter / ChatGPT / Factory used',
      'Codex unavailable or blocked',
      'Approved exception: no code change / emergency rollback'
    ];
    if (checkedCount(legacyRoute, codexOptions) !== 1) errors.push('Exactly one implementation-route option must be checked.');
    if (!substantive(fieldValue(legacyRoute, 'Implementation route / Codex reference'))) {
      errors.push('Implementation route / Codex reference must be filled.');
    }
  }

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
  const errors = validatePrEvidence(process.env.PR_BODY || '');
  if (errors.length) {
    for (const error of errors) console.error(`::error::${error}`);
    process.exit(1);
  }
  console.log('Required PR evidence is substantive and internally selected.');
}

module.exports = {validatePrEvidence};
