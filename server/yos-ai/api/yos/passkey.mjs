import {createProductionPasskeyHandler} from '../../dist/auth/passkey-production.js';
let handler;
export default {async fetch(request){
 try { handler ??= createProductionPasskeyHandler({environment:process.env});return await handler(request); }
 catch {return Response.json({error:'Passkey authentication temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}};
