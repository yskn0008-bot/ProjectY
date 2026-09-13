import {waitUntil} from '@vercel/functions';
import {createProductionSlackEventsHandler} from '../../dist/slack-events/production.js';

let handler;

function getHandler() {
  handler ??= createProductionSlackEventsHandler({environment: process.env, waitUntil});
  return handler;
}

export default {
  async fetch(request) {
    try {
      return await getHandler()(request);
    } catch {
      return Response.json(
        {error: 'YOS Slack intake is temporarily unavailable'},
        {status: 503, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}}
      );
    }
  }
};
