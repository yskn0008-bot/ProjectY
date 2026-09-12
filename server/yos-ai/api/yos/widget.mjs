import {createProductionWidgetFeed} from '../../dist/widget/production.js';

let handler;
function getHandler(){
  handler ??= createProductionWidgetFeed({environment:process.env});
  return handler;
}

export default {
  async fetch(request){
    try{return await getHandler()(request)}catch{
      console.error(JSON.stringify({level:'error',event:'yos_widget_unavailable',route:'/api/yos/widget',stage:'app-init'}));
      return Response.json({error:'Widget feed is temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
  }
};
