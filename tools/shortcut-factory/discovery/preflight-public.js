// A build-time bundling step prepends the four pure public evidence functions.
// No private input, no Notion request, no outbound data except fixed public queries.
const fm = FileManager.local();
const root = fm.documentsDirectory();
const prefix = "YOS DISCOVERY Preflight ";
const stamp = Date.now().toString(36)+"-"+Math.floor(Math.random()*1e12).toString(36);
const request = async (url, json) => {
  const r = new Request(url);
  r.timeoutInterval = 12;
  const value = json ? await r.loadJSON() : await r.loadString();
  if(r.response?.statusCode!==200) throw Error("PUBLIC_HTTP");
  return value;
};
try {
  const now = Date.now();
  const data = await collectPublicPapers("sleep",{requestJson:u=>request(u,true),requestText:u=>request(u,false),now});
  if(!data.evidence.length) throw Error("NO_FULLTEXT");
  const e=data.evidence[0];
  const meta={runId:stamp,evidenceId:e.id,createdAt:now};
  const path=fm.joinPath(root,prefix+stamp+".json");
  const serialized=JSON.stringify(meta);
  if(fm.fileExists(path)) throw Error("PREFLIGHT_COLLISION");
  fm.writeString(path,serialized);
  if(fm.readString(path)!==serialized) throw Error("PREFLIGHT_READBACK");
  Script.setShortcutOutput("YOS_DISCOVERY_PREFLIGHT_READY_V1\n"+JSON.stringify({...meta,sourceURL:e.url,excerpt:e.text.slice(0,1200)}));
} catch(e) {
  Script.setShortcutOutput("YOS_DISCOVERY_PREFLIGHT_HOLD_V1");
} finally { Script.complete(); }
