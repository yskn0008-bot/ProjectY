import {createNotificationHandler} from '../../dist/intake/notification-handler.js';
import {loadYosStorageConfig} from '../../dist/storage/config.js';
import {UpstashRestClient} from '../../dist/storage/upstash-rest.js';
import {createGoogleIdentityVerifier} from '../../dist/auth/google-runtime.js';
import {IdentityGate} from '../../dist/auth/identity-gate.js';

let handler;
function getHandler() {
  if (!handler) {
    const environment=process.env;
    const hash=environment.YOS_CLARITY_INTAKE_TOKEN_SHA256?.trim();
    const notionToken=environment.YOS_NOTION_API_TOKEN?.trim();
    const inbox=environment.YOS_NOTION_INBOX_PAGE_ID?.trim();
    if (!hash||!notionToken||!inbox) throw new Error('Notification intake is not configured');
    const storage=loadYosStorageConfig(environment);
    const clientId=environment.GOOGLE_CLIENT_ID?.trim();
    const subjectHash=environment.GOOGLE_ALLOWED_SUBJECT_HASH?.trim();
    let viewerAuth;
    if(clientId&&subjectHash){
      const verifier=createGoogleIdentityVerifier(clientId);
      const gate=new IdentityGate({expectedAudience:clientId,allowedSubjectHash:subjectHash,requireEmailVerified:true});
      viewerAuth=async token=>{
        await gate.authorize(await verifier.verify(token));
        return true;
      };
    }
    handler=createNotificationHandler({
      tokenSha256:hash,notionToken,notionPageId:inbox,
      redis:new UpstashRestClient({url:storage.upstashUrl,token:storage.upstashToken}),
      ...(viewerAuth?{viewerAuth}:{})
    });
  }
  return handler;
}
function allowedOrigin(origin) {
  if(!origin)return false;
  const approved=(process.env.YOS_ALLOWED_ORIGINS??'').split(',').map(s=>s.trim());
  return approved.includes(origin);
}
export default {fetch:async function(request){
  const origin=request.headers.get('origin')??'';
  const cors=allowedOrigin(origin)
    ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,content-type',
       'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Max-Age':'600'}
    : {};
  if(request.method==='OPTIONS')return new Response(null,{status:origin&&allowedOrigin(origin)?204:403,headers:cors});
  let response;
  try{response=await getHandler()(request)}
  catch{response=Response.json({error:'YOS notification service is unavailable'},
    {status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
  const headers=new Headers(response.headers);
  for(const [key,value]of Object.entries(cors))headers.set(key,value);
  return new Response(response.body,{status:response.status,headers});
}};
