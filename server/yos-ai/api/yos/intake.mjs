import crypto from 'node:crypto';
import {createProductionClarityIntakeHandler} from '../../dist/intake/production.js';
import {CLARITY_RESPONSE_FORMAT, repairPrompt, validateClarityModelResult} from '../../clarity-model-contract.mjs';

const MAX_MODEL_BODY_BYTES = 24_000;
const DEFAULT_MODEL = 'gpt-5.6-terra';
const MAX_MODEL_ATTEMPTS = 2;
// Emergency/bootstrap client credential for the signed iPhone Shortcut.
// Only its SHA-256 digest is stored in source; the bearer token itself is never committed.
// The existing environment-managed token remains valid, so this can be rotated without downtime.
const CLARITY_BOOTSTRAP_TOKEN_SHA256 = '3c5aab82069a6b3d8d4ca463a3d7d7eb35c6959afdb2b6e7fd7f077bc5ffd48f';
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
