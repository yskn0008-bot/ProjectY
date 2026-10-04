import http from 'node:http';
import {pathToFileURL} from 'node:url';

import chat from '../api/yos/chat.mjs';
import health from '../api/yos/health.mjs';
import publicConfig from '../api/yos/public-config.mjs';
import navModel from '../api/yos/nav-model.mjs';
import taxiEvent from '../api/yos/taxi-event.mjs';
import taxiHealth from '../api/yos/taxi-health.mjs';
import tasks from '../api/yos/tasks.mjs';
import tasksHealth from '../api/yos/tasks-health.mjs';
import intake from '../api/yos/intake.mjs';
import projectyDecision from '../api/yos/projecty-decision.mjs';

const MAX_GATEWAY_BODY_BYTES = 2_500_000;
const PORT = Number(process.env.PORT || 8080);

const ROUTES = new Map([
  ['/api/yos/chat', chat],
  ['/api/yos/health', health],
  ['/api/yos/public-config', publicConfig],
  ['/api/yos/nav-model', navModel],
  ['/api/yos/taxi-event', taxiEvent],
  ['/api/yos/taxi-health', taxiHealth],
  ['/api/yos/tasks', tasks],
  ['/api/yos/tasks-health', tasksHealth],
  ['/api/yos/intake', intake],
  ['/api/yos/projecty-decision', projectyDecision]
]);

function requestUrl(request) {
  const protoHeader = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = protoHeader === 'http' || protoHeader === 'https' ? protoHeader : 'https';
  const host = String(request.headers.host || '').trim();
  if (!host) throw new Error('Host header is required');
  return new URL(request.url || '/', `${proto}://${host}`);
}

async function requestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_GATEWAY_BODY_BYTES) {
      const error = new Error('request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function toWebRequest(request) {
  const body = await requestBody(request);
  return new Request(requestUrl(request), {
    method: request.method,
    headers: request.headers,
    ...(body && body.byteLength ? {body} : {})
  });
}

async function sendWebResponse(nodeResponse, response) {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, name) => nodeResponse.setHeader(name, value));
  nodeResponse.setHeader('X-YOS-Provider', 'google-cloud-run');
  const body = Buffer.from(await response.arrayBuffer());
  nodeResponse.end(body);
}

async function handle(request, response) {
  try {
    const url = requestUrl(request);
    const route = ROUTES.get(url.pathname);
    if (!route?.fetch) {
      await sendWebResponse(response, Response.json(
        {error: 'Route is not certified on this provider'},
        {status: 404, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}}
      ));
      return;
    }
    const webRequest = await toWebRequest(request);
    await sendWebResponse(response, await route.fetch(webRequest));
  } catch (error) {
    const status = Number(error?.status) === 413 ? 413 : 503;
    await sendWebResponse(response, Response.json(
      {error: status === 413 ? 'Request body is too large' : 'YOS provider is temporarily unavailable'},
      {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}}
    ));
  }
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT is invalid');

function createNodeServer() {
  return http.createServer((request, response) => {
    void handle(request, response);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createNodeServer().listen(PORT, '0.0.0.0', () => {
    console.log(JSON.stringify({level: 'info', event: 'yos_provider_ready', provider: 'google-cloud-run', port: PORT}));
  });
}

export {MAX_GATEWAY_BODY_BYTES, ROUTES, createNodeServer, handle, requestUrl};
