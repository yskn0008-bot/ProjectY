const DOMAINS = ['life', 'work', 'money', 'home', 'idea', 'shopping', 'communication', 'knowledge', 'system', 'other'];
const INTENTS = ['remember', 'answer', 'create', 'update', 'find', 'compare', 'decide', 'execute', 'monitor', 'notify', 'send', 'buy', 'organize', 'automate'];
const URGENCIES = ['now', 'soon', 'today', 'scheduled', 'background'];
const RISKS = ['low', 'medium', 'high', 'irreversible'];
const EXECUTORS = ['idea', 'memo', 'task', 'calendar', 'reminder', 'shopping', 'answer', 'money', 'timer', 'alarm', 'navigate', 'call', 'message', 'email', 'focus', 'web_search', 'shortcut_factory', 'open_app', 'device_setting', 'myway'];
const OPEN_APPS = new Set(['safari', 'shortcuts', 'files', 'notes', 'phone', 'reminders', 'mail', 'music', 'calendar', 'maps', 'contacts', 'health', 'photos', 'appstore', 'facetime', 'chatgpt', 'scriptable', 'youtube', 'spotify', 'google_sheets']);
const TOGGLE_SETTINGS = new Set(['wifi', 'bluetooth', 'cellular_data', 'airplane_mode', 'low_power_mode', 'flashlight', 'do_not_disturb']);
const DEVICE_SETTINGS = new Set([...TOGGLE_SETTINGS, 'brightness', 'volume', 'appearance']);

const actionProperties = {
  id: {type: 'string'},
  executor: {type: 'string', enum: EXECUTORS},
  domain: {type: 'string', enum: DOMAINS},
  intent: {type: 'string', enum: INTENTS},
  target: {type: 'string'},
  content: {type: 'string'},
  conditions: {type: 'array', items: {type: 'string'}},
  destination: {type: 'string'},
  requires_confirmation: {type: 'boolean'},
  external_write: {type: 'boolean'},
  needs_review: {type: 'boolean'},
  dependency: {anyOf: [{type: 'string'}, {type: 'null'}]},
  status: {type: 'string', enum: ['planned']},
  date_time: {type: 'string'},
  end_date_time: {type: 'string'},
  amount: {type: 'number'},
  subject: {type: 'string'}
};

export const CLARITY_RESPONSE_FORMAT = Object.freeze({
  type: 'json_schema',
  name: 'clarity_action_plan',
  description: 'A fail-closed Clarity plan for local iPhone execution.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['request_id', 'original_input', 'context', 'interpretation', 'actions', 'watches', 'feedback'],
    properties: {
      request_id: {type: 'string'},
      original_input: {type: 'string'},
      context: {
        type: 'object',
        additionalProperties: false,
        required: ['current_time', 'current_priorities', 'relevant_state'],
        properties: {
          current_time: {type: 'string'},
          current_priorities: {type: 'array', items: {type: 'string'}},
          relevant_state: {type: 'object', additionalProperties: false, properties: {}}
        }
      },
      interpretation: {
        type: 'object',
        additionalProperties: false,
        required: ['objective', 'domains', 'urgency', 'risk', 'confidence'],
        properties: {
          objective: {type: 'string'},
          domains: {type: 'array', items: {type: 'string', enum: DOMAINS}},
          urgency: {type: 'string', enum: URGENCIES},
          risk: {type: 'string', enum: RISKS},
          confidence: {type: 'number'}
        }
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(actionProperties),
          properties: actionProperties
        }
      },
      watches: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['condition', 'check_target', 'action_when_true'],
          properties: {
            condition: {type: 'string'},
            check_target: {type: 'string'},
            action_when_true: {type: 'string'}
          }
        }
      },
      feedback: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'next_action', 'whisper_line'],
        properties: {
          summary: {type: 'string'},
          next_action: {type: 'string'},
          whisper_line: {type: 'string'}
        }
      }
    }
  }
});

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateClarityModelResult(result) {
  const errors = [];
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ['root must be an object'];
  if (!nonEmptyText(result.request_id)) errors.push('request_id must be non-empty');
  if (!nonEmptyText(result.original_input)) errors.push('original_input must be non-empty');
  if (!result.interpretation || typeof result.interpretation !== 'object' || Array.isArray(result.interpretation)) {
    errors.push('interpretation must be an object');
  } else {
    if (!RISKS.includes(result.interpretation.risk)) errors.push('interpretation.risk is invalid');
    const confidence = result.interpretation.confidence;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      errors.push('interpretation.confidence must be 0..1');
    }
  }
  if (!Array.isArray(result.actions) || result.actions.length === 0) {
    errors.push('actions must contain at least one action');
    return errors;
  }

  const ids = new Set();
  for (const [index, action] of result.actions.entries()) {
    const prefix = `actions[${index}]`;
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!nonEmptyText(action.id)) errors.push(`${prefix}.id must be non-empty`);
    else if (ids.has(action.id)) errors.push(`${prefix}.id must be unique`);
    else ids.add(action.id);
    if (!EXECUTORS.includes(action.executor)) errors.push(`${prefix}.executor is unsupported`);
    if (!DOMAINS.includes(action.domain)) errors.push(`${prefix}.domain is invalid`);
    if (!INTENTS.includes(action.intent)) errors.push(`${prefix}.intent is invalid`);
    if (action.status !== 'planned') errors.push(`${prefix}.status must be planned`);
    for (const field of ['requires_confirmation', 'external_write', 'needs_review']) {
      if (typeof action[field] !== 'boolean') errors.push(`${prefix}.${field} must be boolean`);
    }
    if (action.external_write === true && action.requires_confirmation !== true) {
      errors.push(`${prefix}.external_write requires confirmation`);
    }
    if (action.executor === 'shortcut_factory' && (action.domain !== 'system' || action.intent !== 'automate')) {
      errors.push(`${prefix}.shortcut_factory route is invalid`);
    }
    if (action.executor === 'open_app') {
      if (action.domain !== 'system' || action.intent !== 'execute') errors.push(`${prefix}.open_app route is invalid`);
      if (action.needs_review !== true && !OPEN_APPS.has(action.target)) errors.push(`${prefix}.open_app target is unsupported`);
    }
    if (action.executor === 'device_setting') {
      if (action.domain !== 'system' || action.intent !== 'update') errors.push(`${prefix}.device_setting route is invalid`);
      if (action.needs_review !== true && !DEVICE_SETTINGS.has(action.target)) errors.push(`${prefix}.device_setting target is unsupported`);
      if (action.needs_review !== true && TOGGLE_SETTINGS.has(action.target) && !['on', 'off', 'toggle'].includes(action.content)) {
        errors.push(`${prefix}.device_setting value is invalid`);
      }
      if (action.needs_review !== true && action.target === 'appearance' && !['light', 'dark', 'toggle'].includes(action.content)) {
        errors.push(`${prefix}.appearance value is invalid`);
      }
      if (action.needs_review !== true && ['brightness', 'volume'].includes(action.target)) {
        const percent = Number(action.content);
        if (!/^(?:0|[1-9]\d?|100)$/u.test(action.content) || !Number.isFinite(percent) || percent < 0 || percent > 100) {
          errors.push(`${prefix}.device_setting percent is invalid`);
        }
      }
    }
    if (action.executor === 'myway') {
      if (action.domain !== 'life' || action.intent !== 'find' || action.target !== 'home') errors.push(`${prefix}.myway route is invalid`);
    }
    if (action.executor === 'money') {
      if (action.domain !== 'money' || action.intent !== 'create') errors.push(`${prefix}.money route is invalid`);
      if (!['expense', 'income'].includes(action.target)) errors.push(`${prefix}.money target is invalid`);
      if (!Number.isFinite(action.amount) || action.amount <= 0 || action.amount > 1000000000) errors.push(`${prefix}.money amount is invalid`);
      if (!nonEmptyText(action.content)) errors.push(`${prefix}.money label is required`);
    }
    if (action.executor === 'timer') {
      if (action.domain !== 'system' || action.intent !== 'execute' || action.target !== 'minutes') errors.push(`${prefix}.timer route is invalid`);
      if (!Number.isFinite(action.amount) || action.amount <= 0 || action.amount > 1440) errors.push(`${prefix}.timer amount is invalid`);
    }
    if (action.executor === 'alarm') {
      if (action.domain !== 'system' || action.intent !== 'create' || action.target !== 'alarm') errors.push(`${prefix}.alarm route is invalid`);
      if (!/^([01]\\d|2[0-3]):[0-5]\\d$/u.test(action.date_time)) errors.push(`${prefix}.alarm date_time must be HH:mm`);
    }
    if (action.executor === 'navigate') {
      if (action.domain !== 'system' || action.intent !== 'execute' || !nonEmptyText(action.target)) errors.push(`${prefix}.navigate route is invalid`);
      if (!['driving', 'walking', 'transit', 'default'].includes(action.content)) errors.push(`${prefix}.navigate mode is invalid`);
    }
    if (action.executor === 'call') {
      if (action.domain !== 'communication' || action.intent !== 'execute' || !nonEmptyText(action.target)) errors.push(`${prefix}.call route is invalid`);
      if (action.requires_confirmation !== true) errors.push(`${prefix}.call requires confirmation`);
    }
    if (action.executor === 'message') {
      if (action.domain !== 'communication' || action.intent !== 'send' || !nonEmptyText(action.target) || !nonEmptyText(action.content)) errors.push(`${prefix}.message route is invalid`);
      if (action.requires_confirmation !== true) errors.push(`${prefix}.message requires confirmation`);
    }
    if (action.executor === 'email') {
      if (action.domain !== 'communication' || action.intent !== 'send' || !nonEmptyText(action.target) || !nonEmptyText(action.content)) errors.push(`${prefix}.email route is invalid`);
      if (action.requires_confirmation !== true) errors.push(`${prefix}.email requires confirmation`);
    }
    if (action.executor === 'focus') {
      if (action.domain !== 'system' || action.intent !== 'update') errors.push(`${prefix}.focus route is invalid`);
      if (!['Do Not Disturb', 'Personal', 'Work', 'Sleep'].includes(action.target)) errors.push(`${prefix}.focus target is invalid`);
      if (!['on', 'off', 'toggle'].includes(action.content)) errors.push(`${prefix}.focus value is invalid`);
    }
    if (action.executor === 'web_search') {
      if (action.domain !== 'knowledge' || action.intent !== 'find' || !nonEmptyText(action.content)) errors.push(`${prefix}.web_search route is invalid`);
      if (!['Google', 'DuckDuckGo', 'Yahoo!', 'YouTube'].includes(action.target)) errors.push(`${prefix}.web_search engine is invalid`);
    }
    if (action.needs_review !== true) {
      if ((action.executor === 'calendar' || action.executor === 'reminder') && !nonEmptyText(action.date_time)) {
        errors.push(`${prefix}.date_time is required for executable timed actions`);
      }
      if (action.executor === 'calendar' && !nonEmptyText(action.end_date_time)) {
        errors.push(`${prefix}.end_date_time is required for executable calendar actions`);
      }
    }
  }

  if (result.interpretation && ['high', 'irreversible'].includes(result.interpretation.risk)) {
    for (const [index, action] of result.actions.entries()) {
      if (action?.requires_confirmation !== true) errors.push(`actions[${index}] high-risk action requires confirmation`);
    }
  }
  return errors;
}

export function repairPrompt(originalPrompt, errors) {
  return `${originalPrompt}\n\nCONTRACT REPAIR: Your previous plan was unusable for these reasons: ${errors.join('; ')}. Return a fresh plan that satisfies the schema and safety rules. Always include at least one planned action. If a date/time is genuinely ambiguous, keep the action and set needs_review=true instead of omitting it.`;
}
