import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const repoDir = resolve(appDir, '..');
const webDir = resolve(appDir, 'www');

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

await cp(resolve(repoDir, 'taxi'), resolve(webDir, 'taxi'), { recursive: true });
await cp(resolve(repoDir, 'life'), resolve(webDir, 'life'), { recursive: true });
await cp(resolve(appDir, 'shell', 'index.html'), resolve(webDir, 'index.html'));

await writeFile(
  resolve(webDir, 'build-info.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), source: 'ProjectY' }, null, 2),
  'utf8'
);

console.log('Prepared bundled web assets for YOS iOS app.');
