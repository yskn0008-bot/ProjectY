import crypto from 'node:crypto';
import {createProductionClarityIntakeHandler} from '../../dist/intake/production.js';

const MAX_MODEL_BODY_BYTES = 24_000;
const DEFAULT_MODEL = 'gpt-5.6-terra';
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

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) return content.text.trim();
    }
  }
  return null;
}

export async function handleClarityModel(request) {
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const token = bearerToken(request.headers.get('authorization'));
  if (!token || !matchesSha256(token, process.env.YOS_CLARITY_INTAKE_TOKEN_SHA256)) return json({error: 'Unauthorized'}, 401);

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

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        input: prompt,
        store: false,
        text: {format: {type: 'json_object'}}
      })
    });
  } catch { return json({error: 'OpenAI request failed'}, 503); }

  let payload;
  try { payload = await upstream.json(); } catch { return json({error: 'OpenAI returned an invalid response'}, 502); }
  if (!upstream.ok) {
    const code = typeof payload?.error?.code === 'string' ? payload.error.code : 'upstream_error';
    return json({error: 'OpenAI request failed', code}, upstream.status >= 500 ? 503 : 502);
  }

  const outputText = extractOutputText(payload);
  if (!outputText) return json({error: 'OpenAI returned no model output'}, 502);

  let result;
  try { result = JSON.parse(outputText); } catch { return json({error: 'Model output was not valid JSON'}, 502); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return json({error: 'Model output root must be an object'}, 502);

  return json(result);
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
