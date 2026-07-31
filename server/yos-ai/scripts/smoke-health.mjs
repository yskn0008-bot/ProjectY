const baseUrl = process.env.YOS_API_BASE_URL?.trim();
const origin = process.env.YOS_SMOKE_ORIGIN?.trim();

if (!baseUrl || !origin) {
  console.error('YOS_API_BASE_URL and YOS_SMOKE_ORIGIN are required');
  process.exit(1);
}

const url = new URL('/api/yos/health', baseUrl);
const response = await fetch(url, {
  method: 'GET',
  headers: {Origin: origin},
  redirect: 'error'
});

let body;
try {
  body = await response.json();
} catch {
  body = null;
}

if (!response.ok || body?.status !== 'ok' || body?.service !== 'yos-ai') {
  console.error(`YOS AI health smoke failed with HTTP ${response.status}`);
  process.exit(1);
}

console.log(`YOS AI health smoke passed: ${body.service} ${body.version}`);
