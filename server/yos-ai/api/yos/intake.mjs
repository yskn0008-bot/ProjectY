import crypto from 'node:crypto';
import {createProductionClarityIntakeHandler} from '../../dist/intake/production.js';
import {CLARITY_RESPONSE_FORMAT, repairPrompt, validateClarityModelResult} from '../../clarity-model-contract.mjs';

const MAX_MODEL_BODY_BYTES = 24_000;
const DEFAULT_MODEL = 'gpt-5.6-terra';
const MAX_MODEL_ATTEMPTS = 2;
const MAX_FACTORY_BODY_BYTES = 24_000;
const MAX_FACTORY_REQUEST_CHARS = 4_000;
const HUBSIGN_URL = 'https://hubsign.routinehub.services/sign';
const SHORTCUT_APP_ALLOWLIST = Object.freeze({
  safari: ['Safari', 'com.apple.mobilesafari'],
  shortcuts: ['Shortcuts', 'com.apple.shortcuts'],
  files: ['Files', 'com.apple.DocumentsApp'],
  notes: ['Notes', 'com.apple.mobilenotes'],
  phone: ['Phone', 'com.apple.mobilephone'],
  reminders: ['Reminders', 'com.apple.reminders'],
  mail: ['Mail', 'com.apple.mobilemail'],
  music: ['Music', 'com.apple.Music'],
  calendar: ['Calendar', 'com.apple.mobilecal'],
  maps: ['Maps', 'com.apple.Maps'],
  contacts: ['Contacts', 'com.apple.MobileAddressBook'],
  health: ['Health', 'com.apple.Health'],
  photos: ['Photos', 'com.apple.mobileslideshow'],
  appstore: ['App Store', 'com.apple.AppStore'],
  facetime: ['FaceTime', 'com.apple.facetime'],
  chatgpt: ['ChatGPT', 'com.openai.chat'],
  scriptable: ['Scriptable', 'dk.simonbs.Scriptable'],
  youtube: ['YouTube', 'com.google.ios.youtube'],
  spotify: ['Spotify', 'com.spotify.client'],
  google_sheets: ['Google Sheets', 'com.google.Sheets']
});
const SHORTCUT_FACTORY_RESPONSE_FORMAT = Object.freeze({
  type: 'json_schema',
  name: 'shortcut_factory_definition',
  description: 'A fail-closed Apple Shortcut definition using only proven actions.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['supported', 'name', 'actions', 'reason'],
    properties: {
      supported: {type: 'boolean'},
      name: {type: 'string'},
      reason: {type: 'string'},
      actions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'app'],
          properties: {
            type: {type: 'string', enum: ['open_app']},
            app: {type: 'string', enum: Object.keys(SHORTCUT_APP_ALLOWLIST)}
          }
        }
      }
    }
  }
});
// Emergency/bootstrap client credential for the signed iPhone Shortcut.
// Only its SHA-256 digest is stored in source; the bearer token itself is never committed.
// The existing environment-managed token remains valid, so this can be rotated without downtime.
const CLARITY_BOOTSTRAP_TOKEN_SHA256 = '4227fb9887f3018d5f0bbc7dc98e1c672a2954c444133a402d83d1de09875b7c';
let handler;

function getHandler() {
  handler ??= createProductionClarityIntakeHandler({environment: process.env});
  return handler;
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function modelJsonText(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function bearerToken(header) {
  if (!header) return null;
  const match = /^Bearer ([^\s]{16,512})$/u.exec(header);
  return match?.[1] ?? null;
}

function matchesSha256(value, expectedHex) {
  const normalized = String(expectedHex || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) return false;
  const actual = crypto.createHash('sha256').update(value, 'utf8').digest('hex');
  const a = Buffer.from(actual, 'utf8');
  const b = Buffer.from(normalized, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorizedClarityToken(token) {
  if (!token) return false;
  return [process.env.YOS_CLARITY_INTAKE_TOKEN_SHA256, CLARITY_BOOTSTRAP_TOKEN_SHA256]
    .some((expected) => matchesSha256(token, expected));
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) return content.text.trim();
    }
  }
  return null;
}

async function requestStructuredPlan(apiKey, model, prompt) {
  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model,
        input: prompt,
        store: false,
        text: {format: CLARITY_RESPONSE_FORMAT}
      })
    });
  } catch {
    return {response: json({error: 'OpenAI request failed'}, 503)};
  }

  let payload;
  try { payload = await upstream.json(); }
  catch { return {response: json({error: 'OpenAI returned an invalid response'}, 502)}; }

  if (!upstream.ok) {
    const code = typeof payload?.error?.code === 'string' ? payload.error.code : 'upstream_error';
    return {response: json({error: 'OpenAI request failed', code}, upstream.status >= 500 ? 503 : 502)};
  }

  const outputText = extractOutputText(payload);
  if (!outputText) return {errors: ['OpenAI returned no model output']};

  let result;
  try { result = JSON.parse(outputText); }
  catch { return {errors: ['Model output was not valid JSON']}; }

  const errors = validateClarityModelResult(result);
  return errors.length ? {errors} : {result};
}


function shortcutFactoryPrompt(requestText) {
  return `Convert the user's iPhone automation request into a minimal Apple Shortcut definition.
Return only the required structured output.
Supported action in this first repaired lane: open_app.
Supported app keys: ${Object.keys(SHORTCUT_APP_ALLOWLIST).join(', ')}.
Set supported=true only when the entire requested Shortcut can be represented using only those supported open_app actions.
If any requested behavior is unsupported, ambiguous, destructive, payment-related, authentication-sensitive, or requires inventing parameters, set supported=false, actions=[], and give a short reason.
Use a short useful shortcut name. Never add actions the user did not request.
User request:
${requestText}`;
}

function validateShortcutFactoryDefinition(definition) {
  const errors = [];
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return ['root must be an object'];
  if (typeof definition.supported !== 'boolean') errors.push('supported must be boolean');
  if (typeof definition.name !== 'string' || definition.name.trim().length < 1 || definition.name.trim().length > 80) errors.push('name must be 1..80 chars');
  if (typeof definition.reason !== 'string') errors.push('reason must be text');
  if (!Array.isArray(definition.actions)) errors.push('actions must be an array');
  if (definition.supported === false && Array.isArray(definition.actions) && definition.actions.length !== 0) errors.push('unsupported definitions must have no actions');
  if (definition.supported === true) {
    if (!Array.isArray(definition.actions) || definition.actions.length < 1 || definition.actions.length > 8) errors.push('supported definitions need 1..8 actions');
    for (const [index, action] of (Array.isArray(definition.actions) ? definition.actions : []).entries()) {
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        errors.push(`actions[${index}] must be an object`);
        continue;
      }
      if (action.type !== 'open_app') errors.push(`actions[${index}].type is unsupported`);
      if (!Object.hasOwn(SHORTCUT_APP_ALLOWLIST, action.app)) errors.push(`actions[${index}].app is unsupported`);
    }
  }
  return errors;
}

async function requestShortcutDefinition(apiKey, model, requestText, repairErrors = []) {
  const prompt = repairErrors.length
    ? shortcutFactoryPrompt(requestText) + `\nCONTRACT REPAIR: ${repairErrors.join('; ')}. Return a fresh valid definition.`
    : shortcutFactoryPrompt(requestText);
  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model,
        input: prompt,
        store: false,
        text: {format: SHORTCUT_FACTORY_RESPONSE_FORMAT}
      })
    });
  } catch {
    return {response: json({error: 'Shortcut Factory model request failed'}, 503)};
  }

  let payload;
  try { payload = await upstream.json(); }
  catch { return {response: json({error: 'Shortcut Factory model returned invalid data'}, 502)}; }

  if (!upstream.ok) return {response: json({error: 'Shortcut Factory model request failed'}, upstream.status >= 500 ? 503 : 502)};
  const outputText = extractOutputText(payload);
  if (!outputText) return {errors: ['model returned no output']};

  let definition;
  try { definition = JSON.parse(outputText); }
  catch { return {errors: ['model output was not valid JSON']}; }
  const errors = validateShortcutFactoryDefinition(definition);
  return errors.length ? {errors} : {definition};
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function shortcutXml(definition) {
  const actionXml = definition.actions.map((action) => {
    const [displayName, bundleId] = SHORTCUT_APP_ALLOWLIST[action.app];
    const uuid = crypto.randomUUID().toUpperCase();
    return `<dict>
<key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.openapp</string>
<key>WFWorkflowActionParameters</key><dict>
<key>UUID</key><string>${uuid}</string>
<key>WFAppIdentifier</key><string>${xmlEscape(bundleId)}</string>
<key>WFSelectedApp</key><dict>
<key>BundleIdentifier</key><string>${xmlEscape(bundleId)}</string>
<key>Name</key><string>${xmlEscape(displayName)}</string>
</dict>
</dict>
</dict>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>WFWorkflowName</key><string>${xmlEscape(definition.name.trim())}</string>
<key>WFWorkflowActions</key><array>${actionXml}</array>
<key>WFWorkflowClientVersion</key><string>2607.1.3</string>
<key>WFWorkflowClientRelease</key><string>26.0</string>
<key>WFWorkflowMinimumClientVersion</key><integer>900</integer>
<key>WFWorkflowMinimumClientVersionString</key><string>900</string>
<key>WFWorkflowIcon</key><dict>
<key>WFWorkflowIconStartColor</key><integer>463140863</integer>
<key>WFWorkflowIconGlyphNumber</key><integer>59511</integer>
</dict>
<key>WFWorkflowImportQuestions</key><array/>
<key>WFWorkflowInputContentItemClasses</key><array><string>WFAppContentItem</string><string>WFStringContentItem</string></array>
<key>WFWorkflowOutputContentItemClasses</key><array/>
<key>WFWorkflowTypes</key><array/>
<key>WFQuickActionSurfaces</key><array/>
<key>WFWorkflowHasOutputFallback</key><false/>
<key>WFWorkflowHasShortcutInputVariables</key><false/>
</dict></plist>`;
}

async function signShortcutWithHubSign(definition) {
  const unsignedXml = shortcutXml(definition);
  let response;
  try {
    response = await fetch(HUBSIGN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ProjectY-ShortcutFactory/1.0',
        'Origin': 'https://routinehub.co',
        'Referer': 'https://routinehub.co/'
      },
      body: JSON.stringify({shortcutName: definition.name.trim(), shortcut: unsignedXml})
    });
  } catch {
    return {response: json({error: 'Shortcut signing service unavailable'}, 503)};
  }
  if (!response.ok) return {response: json({error: 'Shortcut signing failed'}, 502)};
  let bytes;
  try { bytes = new Uint8Array(await response.arrayBuffer()); }
  catch { return {response: json({error: 'Shortcut signing returned invalid data'}, 502)}; }
  const header = new TextDecoder().decode(bytes.slice(0, 4));
  if (header !== 'AEA1' || bytes.byteLength < 500) return {response: json({error: 'Shortcut signing envelope is invalid'}, 502)};
  return {bytes};
}

export async function handleShortcutFactory(request) {
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
  const token = bearerToken(request.headers.get('authorization'));
  if (!authorizedClarityToken(token)) return json({error: 'Unauthorized'}, 401);
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return json({error: 'Content-Type must be application/json'}, 415);
  }

  let bodyText;
  try { bodyText = await request.text(); } catch { return json({error: 'Invalid request body'}, 400); }
  if (new TextEncoder().encode(bodyText).byteLength > MAX_FACTORY_BODY_BYTES) return json({error: 'Request body is too large'}, 413);
  let body;
  try { body = JSON.parse(bodyText); } catch { return json({error: 'Invalid JSON'}, 400); }
  const requestText = typeof body?.request === 'string' ? body.request.trim() : '';
  if (!requestText || requestText.length > MAX_FACTORY_REQUEST_CHARS) return json({error: 'request is required'}, 400);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({error: 'Shortcut Factory is not configured'}, 503);
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  let outcome = await requestShortcutDefinition(apiKey, model, requestText);
  if (outcome.response) return outcome.response;
  if (!outcome.definition) {
    outcome = await requestShortcutDefinition(apiKey, model, requestText, outcome.errors || ['invalid definition']);
    if (outcome.response) return outcome.response;
  }
  if (!outcome.definition) return json({error: 'Shortcut definition failed validation'}, 502);
  if (!outcome.definition.supported) {
    return json({error: 'Unsupported Shortcut request', reason: outcome.definition.reason || 'unsupported automation'}, 422);
  }

  const signed = await signShortcutWithHubSign(outcome.definition);
  if (signed.response) return signed.response;
  return new Response(signed.bytes, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="YOS-Generated.shortcut"',
      'X-Content-Type-Options': 'nosniff',
      'X-YOS-Shortcut-Factory': '1'
    }
  });
}

export async function handleClarityModel(request) {
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const token = bearerToken(request.headers.get('authorization'));
  if (!authorizedClarityToken(token)) return json({error: 'Unauthorized'}, 401);

  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return json({error: 'Content-Type must be application/json'}, 415);
  }

  let bodyText;
  try { bodyText = await request.text(); } catch { return json({error: 'Invalid request body'}, 400); }
  if (new TextEncoder().encode(bodyText).byteLength > MAX_MODEL_BODY_BYTES) return json({error: 'Request body is too large'}, 413);

  let body;
  try { body = JSON.parse(bodyText); } catch { return json({error: 'Invalid JSON'}, 400); }
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > 20_000) return json({error: 'prompt is required'}, 400);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({error: 'Clarity model gateway is not configured'}, 503);
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  let currentPrompt = prompt;
  let lastErrors = [];
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt += 1) {
    const outcome = await requestStructuredPlan(apiKey, model, currentPrompt);
    if (outcome.response) return outcome.response;
    if (outcome.result) {
      // Shortcuts' Get Contents of URL auto-converts application/json into a native
      // Dictionary. Clarity deliberately performs its own Get Dictionary from Input
      // step, so return schema-validated JSON as text and preserve nested actions[].
      return modelJsonText(outcome.result);
    }
    lastErrors = outcome.errors || ['unknown model contract error'];
    if (attempt < MAX_MODEL_ATTEMPTS) currentPrompt = repairPrompt(prompt, lastErrors);
  }

  return json({error: 'Model output failed Clarity contract'}, 502);
}

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.searchParams.get('mode') === 'model') return await handleClarityModel(request);
      if (url.searchParams.get('mode') === 'factory') return await handleShortcutFactory(request);
      return await getHandler()(request);
    } catch {
      return Response.json(
        {error: 'YOS Intake is temporarily unavailable'},
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
          }
        }
      );
    }
  }
};
