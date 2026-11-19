import {createProductionShoppingHandler} from '../../dist/shopping/handler.js';

let handler;
function getHandler(){
  handler??=createProductionShoppingHandler({environment:process.env});
  return handler;
}

export default {
  async fetch(request){
    try{return await getHandler()(request)}
    catch{
      return Response.json({error:'Shopping is temporarily unavailable'},{status:503,headers:{
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'
      }});
    }
  }
};
