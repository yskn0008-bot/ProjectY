import {runProductionPreflight} from '../dist/preflight.js';

const report = runProductionPreflight(process.env);

for (const check of report.checks) {
  const mark = check.status === 'pass' ? 'PASS' : check.status === 'warning' ? 'WARN' : 'FAIL';
  console.log(`[${mark}] ${check.id}: ${check.message}`);
}

console.log(`YOS AI production preflight: ${report.status} (${report.failed} failed, ${report.warnings} warnings)`);

if (report.status !== 'ready') process.exitCode = 1;
