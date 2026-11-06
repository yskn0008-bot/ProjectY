import {createNotificationHandler} from '../../dist/intake/notification-handler.js';
import {loadYosStorageConfig} from '../../dist/storage/config.js';
import {UpstashRestClient} from '../../dist/storage/upstash-rest.js';

let handler;
function getHandler() {
  if (!handler) {
    const environment=process.env;
    const hash=environment.YOS_CLARITY_INTAKE_TOKEN_SHA256?.trim();
    const notionToken=environment.YOS_NOTION_API_TOKEN?.trim();
    const inbox=environment.YOS_NOTION_INBOX_PAGE_ID?.trim();
    if (!hash||!notionToken||!inbox) throw new Error('Notification intake is not configured');
    const storage=loadYosStorageConfig(environment);
    handler=createNotificationHandler({
      tokenSha256:hash,notionToken,notionPageId:inbox,
      redis:new UpstashRestClient({url:storage.upstashUrl,token:storage.upstashToken})
    });
  }
  return handler;
}
export default {fetch:async function(request){
  try{return await getHandler()(request)}
  catch{return Response.json({error:'YOS notification service is unavailable'},
    {status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
}};
