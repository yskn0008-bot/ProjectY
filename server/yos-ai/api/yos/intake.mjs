import {createProductionClarityIntakeHandler} from '../../dist/intake/production.js';

let handler;

function getHandler() {
  handler ??= createProductionClarityIntakeHandler({environment: process.env});
  return handler;
}

export default {
  async fetch(request) {
    try {
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
