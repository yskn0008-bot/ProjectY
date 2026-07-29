import responseSchema from '../../schemas/yos-answer.schema.json' with {type: 'json'};
import {createProductionYosApp} from '../../dist/runtime/production.js';

let handlers;

function getHandlers() {
  handlers ??= createProductionYosApp({
    environment: process.env,
    responseSchema,
    healthVersion: '0.1.0'
  });
  return handlers;
}

export default {
  async fetch(request) {
    try {
      return await getHandlers().chat(request);
    } catch {
      return Response.json(
        {error: 'YOS is temporarily unavailable'},
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
