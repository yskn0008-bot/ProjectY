import {createProductionCalendarPasskey} from '../../dist/tasks/calendar-passkey-production.js';
let handler;
export default {
  async fetch(request) {
    try {
      handler ??= createProductionCalendarPasskey({environment:process.env});
      return await handler(request);
    } catch {
      console.error(JSON.stringify({level:'error',event:'calendar_passkey_unavailable',stage:'initialization'}));
      return Response.json({error:'Passkey service unavailable'},{status:503,headers:{
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
      }});
    }
  }
};
