'use strict';

const fs = require('node:fs');

function writeResultOutputs(resultPath, outputPath) {
  if (!resultPath || !outputPath) throw new Error('Result and output paths are required');
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid recovery result');
  const recovery = result.recovery || null;
  const target = recovery?.target || '';
  if (typeof target !== 'string' || (target && !/^PR#[1-9][0-9]*$/.test(target))) {
    throw new Error('Invalid recovery target');
  }
  const summary = {
    needs_yos: recovery?.action === 'NEEDS_YOS',
    external_wait: recovery?.action === 'EXTERNAL_WAIT',
    target
  };
  fs.appendFileSync(outputPath, `needs_yos=${summary.needs_yos}\nexternal_wait=${summary.external_wait}\ntarget=${target}\n`);
  return summary;
}

module.exports = {writeResultOutputs};
if (require.main === module) {
  try { console.log(JSON.stringify(writeResultOutputs(process.argv[2], process.argv[3]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
