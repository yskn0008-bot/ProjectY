// Local diagnostic only; do not retrieve or transmit the existing Notion key.
const fm=FileManager.local();
let result={status:"held",reason:"MODEL_HANDOFF_INVALID"};
try {
 let raw=args.shortcutParameter;
 if(Array.isArray(raw)&&raw.length===1)raw=raw[0];
 const match=/^YOS_DISCOVERY_PREFLIGHT_V1\|([a-z0-9-]{5,80})\|(PMC[0-9]+)$/.exec(String(raw||"").trim());
 if(!match)throw Error("MODEL_HANDOFF_INVALID");
 const path=fm.joinPath(fm.documentsDirectory(),"YOS DISCOVERY Preflight "+match[1]+".json");
 const prior=JSON.parse(fm.readString(path));
 if(prior.runId!==match[1]||prior.evidenceId!==match[2]||Date.now()-prior.createdAt>3600000||Date.now()<prior.createdAt)throw Error("MODEL_HANDOFF_MISMATCH");
 result={status:"preflight_pass",runId:prior.runId,evidenceId:prior.evidenceId,existingNotionKeyPresent:Keychain.contains("YOS_NOTION_INTEGRATION_TOKEN"),notionWrite:false,notionVerified:false};
 const out=fm.joinPath(fm.documentsDirectory(),"YOS DISCOVERY Preflight Receipt "+match[1]+".json");
 if(fm.fileExists(out))throw Error("PREFLIGHT_RECEIPT_EXISTS");
 const serial=JSON.stringify(result);
 fm.writeString(out,serial);
 if(fm.readString(out)!==serial)throw Error("PREFLIGHT_RECEIPT_READBACK");
} catch(e) { result={status:"held",reason:String(e.message||e).slice(0,100)}; }
finally { Script.setShortcutOutput(JSON.stringify(result)); Script.complete(); }
