import {timingSafeEqual} from 'node:crypto';
import {createInboxSorter} from '../../dist/intake/inbox-sorter.js';
import {loadYosStorageConfig} from '../../dist/storage/config.js';
import {UpstashRestClient} from '../../dist/storage/upstash-rest.js';

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /u, '') ?? '';
  if (!secret || secret.length < 16 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

async function handle(request) {
  if (request.method !== 'GET') return Response.json({error: 'Method not allowed'}, {status: 405});
  if (!authorized(request)) return Response.json({error: 'Unauthorized'}, {status: 401});
  if (process.env.YOS_INBOX_SORT_ENABLED !== '1') return Response.json({error: 'Not enabled'}, {status: 503});
  try {
    const storage = loadYosStorageConfig(process.env);
    const run = createInboxSorter({
      notionToken: process.env.YOS_NOTION_API_TOKEN ?? '',
      inboxPageId: process.env.YOS_NOTION_INBOX_PAGE_ID ?? '',
      mode: process.env.YOS_INBOX_SORT_MODE ?? 'test',
      redis: new UpstashRestClient({url: storage.upstashUrl, token: storage.upstashToken})
    });
    return Response.json({ok: true, ...await run()}, {headers: {'Cache-Control': 'no-store'}});
  } catch {
    return Response.json({error: 'Inbox sorting held; original remains'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
}

export default {fetch: handle};
