import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const SOURCE_URL=new URL('../src/review/weekly-review.ts',import.meta.url);
const TARGET_URL=new URL('../../../life/weekly-review-engine-v1.js',import.meta.url);

export async function buildBrowserSource(){
  const source=await readFile(SOURCE_URL,'utf8');
  const hash=createHash('sha256').update(source).digest('hex');
  let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  output=output.replace(/\bexport\s+function\s+buildWeeklyReview\b/,'function buildWeeklyReview').replace(/\nexport \{\};?\s*$/,'\n');
  if(/\bexport\b/.test(output))throw new Error('Unexpected export survived Weekly Review browser build');
  return `'use strict';\n// Generated from server/yos-ai/src/review/weekly-review.ts. Do not hand-edit.\n// source-sha256: ${hash}\n(()=>{\n  if(globalThis.YOSWeeklyReviewEngineV1)return;\n${output.split('\n').map(line=>line?'  '+line:line).join('\n')}\n  globalThis.YOSWeeklyReviewEngineV1=Object.freeze({buildWeeklyReview});\n})();\n`;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  await writeFile(TARGET_URL,await buildBrowserSource(),'utf8');
}
