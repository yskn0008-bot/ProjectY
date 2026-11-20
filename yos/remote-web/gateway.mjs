import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {validateCommand} from './command-contract.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const HOST='127.0.0.1'; // Deliberately loopback only: no exposed unauthenticated LAN listener
const PORT=Number(process.env.YOS_REMOTE_PORT||8787);
const secret=process.env.YOS_REMOTE_TOKEN||'';
const tvHost=process.env.YOS_BRAVIA_HOST||'';
const tvPsk=process.env.YOS_BRAVIA_PSK||'';
const tvActions=Object.freeze({power:['PowerOff','Power'],input:['Input'],home:['Home'],back:['Return','Back'],up:['Up'],down:['Down'],left:['Left'],right:['Right'],confirm:['Confirm','Enter'],volumeDown:['VolumeDown'],mute:['Mute'],volumeUp:['VolumeUp']});
const failures=new Map();
function validToken(header){
 if(!secret||secret.length<32||!header?.startsWith('Bearer '))return false;
 const actual=Buffer.from(header.slice(7));const expected=Buffer.from(secret);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))}
async function readJson(req){
 let body='';for await(const part of req){body+=part;if(body.length>2048)throw Error('request too large')}
 return JSON.parse(body);
}
async function sonyRequest(path,body,contentType){
 const response=await fetch('http://'+tvHost+path,{method:'POST',headers:{'Content-Type':contentType,'X-Auth-PSK':tvPsk,...(path==='/sony/ircc'?{'SOAPACTION':'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'}:{})},body,signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('BRAVIA HTTP '+response.status);
 return response.text();
}
async function bravia(action){
 if(!tvHost||!tvPsk)throw Error('BRAVIA not configured');
 if(!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(tvHost)||tvHost.split('.').some(n=>Number(n)>255))throw Error('invalid BRAVIA host');
 const result=JSON.parse(await sonyRequest('/sony/system',JSON.stringify({method:'getRemoteControllerInfo',params:[],id:1,version:'1.0'}),'application/json'));
 const codes=result?.result?.[1];if(!Array.isArray(codes))throw Error('BRAVIA command discovery failed');
 const index=new Map(codes.filter(c=>c?.name&&c?.value).map(c=>[String(c.name).toLowerCase(),String(c.value)]));
 const code=tvActions[action]?.map(x=>index.get(x.toLowerCase())).find(Boolean);
 if(!code)throw Error('unsupported BRAVIA command');
 const xml='<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+code.replace(/[<>&"']/g,'')+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';
 await sonyRequest('/sony/ircc',xml,'text/xml; charset=UTF-8');
 return {ok:true,acknowledged:true,observed:false};
}
export function createServer(){
 return http.createServer(async(req,res)=>{
  try{
   if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,mode:'loopback',tvConfigured:!!(tvHost&&tvPsk),tapoConfigured:false});
   if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html')){
    const html=await readFile(join(root,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});return res.end(html);
   }
   if(req.url!=='/api/remote/command'||req.method!=='POST')return json(res,404,{ok:false,error:'not found'});
   if(!validToken(req.headers.authorization))return json(res,401,{ok:false,error:'authentication required'});
   const ip=req.socket.remoteAddress||'';const now=Date.now();const prior=failures.get(ip)||[];const recent=prior.filter(t=>now-t<10000);
   if(recent.length>=8)return json(res,429,{ok:false,error:'rate limit'});
   recent.push(now);failures.set(ip,recent);
   let command;try{command=validateCommand(await readJson(req))}catch{return json(res,400,{ok:false,error:'invalid command'})}
   if(command.device!=='tv')return json(res,501,{ok:false,error:'device adapter not implemented'});
   try{return json(res,200,await bravia(command.action))}catch{return json(res,502,{ok:false,error:'BRAVIA command failed or unverified'})}
  }catch{return json(res,500,{ok:false,error:'internal error'})}
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])createServer().listen(PORT,HOST,()=>console.log('YOS Remote diagnostic gateway listening on loopback '+PORT));
