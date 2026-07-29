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
      return await getHandlers().health(request);
    } catch {
      return Response.json(
        {status: 'unavailable', version: '0.1.0'},
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
