import {createProductionTaskDashboard} from '../../dist/tasks/production.js';

let handler;
function getHandler(){
  handler ??= createProductionTaskDashboard({environment:process.env});
  return handler;
}

export default {
  async fetch(request){
    try{return await getHandler()(request)}catch{
      console.error(JSON.stringify({level:'error',event:'yos_tasks_unavailable',route:'/api/yos/tasks',stage:'app-init'}));
      return Response.json({error:'Task dashboard is temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
  }
};
