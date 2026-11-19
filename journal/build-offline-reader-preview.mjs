/**
 * Existing YOS JOURNAL reader + public-only editorial candidate -> offline
 * preview HTML. Safe, test-only output. Does not modify the real reader.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateCandidate} from './gpt-editorial-gate.mjs';

const SCRIPT_MARKER="\n<script>\n(()=>{'use strict';";
const DATE_MARKER="const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});";
const SERVICE_WORKER="<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});</script>";
function refuse(message){throw new Error('Offline reader preview refused: '+message);}
export function buildOfflineReaderPreview(html,candidate){
 if(typeof html!=='string'||!html.includes(SCRIPT_MARKER)||!html.includes(DATE_MARKER)||!html.includes(SERVICE_WORKER))
  refuse('unexpected real reader template');
 const issuedOn=candidate?.issue?.issuedOn;
 if(typeof issuedOn!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn))refuse('invalid issue date');
 const now=new Date(issuedOn+'T03:00:00Z');
 validateCandidate(candidate,{now});
 const issue=structuredClone(candidate.issue);
 const json=JSON.stringify(issue).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 const guard=[
  '<script>',
  '/* OFFLINE EDITORIAL PREVIEW - NOT PUBLISHED */',
  '(()=>{',
  ' const issue=__PREVIEW_JSON__;',
  ' const date=issue.issuedOn;',
  ' const allowed=new Set([',
  "  'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/journal/editions/'+date+'.json',",
  "  'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/ios-app/scriptable/journal/latest.json'",
  ' ]);',
  ' window.fetch=async(input)=>{',
  '  const u=String(input);',
  "  if(allowed.has(u))return new Response(JSON.stringify(issue),{status:200,headers:{'content-type':'application/json'}});",
  "  return new Response('Offline preview rejects unrelated URLs',{status:404});",
  ' };',
  '})();',
  '</script>'
 ].join('\n');
 let out=html.replace(SCRIPT_MARKER,'\n'+guard.replace('__PREVIEW_JSON__',json)+SCRIPT_MARKER);
 out=out.replace(DATE_MARKER,'const today='+JSON.stringify(issuedOn)+';');
 out=out.replace(SERVICE_WORKER,'<!-- Offline preview: service worker disabled -->');
 const label='<div id="yos-editorial-preview-banner" role="note" style="position:sticky;top:0;z-index:99999;padding:12px;background:#1a2334;color:#fff;text-align:center;font:700 13px system-ui">非公開の編集プレビュー｜実際の発行・通知はしていません</div>';
 out=out.replace('<body>','<body>'+label);
 if(!out.includes('yos-editorial-preview-banner')||out.includes(DATE_MARKER)||out.includes(SERVICE_WORKER))refuse('preview injection failure');
 return out;
}
async function main(args){
 if(args.length!==6||args[0]!=='--candidate'||args[2]!=='--reader'||args[4]!=='--output')
  refuse('Usage: node journal/build-offline-reader-preview.mjs --candidate FILE --reader journal-v2/index.html --output /tmp/preview.html');
 const [candidate,html]=await Promise.all([readFile(resolve(args[1]),'utf8'),readFile(resolve(args[3]),'utf8')]);
 const out=buildOfflineReaderPreview(html,JSON.parse(candidate));
 await writeFile(resolve(args[5]),out,{flag:'wx'});
 console.log('Offline preview built without publication: '+out.length+' bytes');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
