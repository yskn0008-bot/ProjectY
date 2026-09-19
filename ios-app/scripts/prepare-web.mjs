import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const repoDir = resolve(appDir, '..');
const webDir = resolve(appDir, 'www');

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

await cp(resolve(repoDir, 'yos'), resolve(webDir, 'yos'), { recursive: true });
await cp(resolve(repoDir, 'life'), resolve(webDir, 'life'), { recursive: true });
// Taxi remains bundled only as a compatibility screen; it is not a primary YOS domain.
await cp(resolve(repoDir, 'taxi'), resolve(webDir, 'taxi'), { recursive: true });
await cp(resolve(appDir, 'shell'), webDir, { recursive: true });

await cp(resolve(repoDir, 'manifest.webmanifest'), resolve(webDir, 'manifest.webmanifest'));
await cp(resolve(repoDir, 'service-worker.js'), resolve(webDir, 'service-worker.js'));
await mkdir(resolve(webDir, 'assets'), { recursive: true });
await cp(resolve(repoDir, 'assets', 'yos-icon-180.png'), resolve(webDir, 'assets', 'yos-icon-180.png'));
await cp(resolve(repoDir, 'assets', 'yos-icon-512.png'), resolve(webDir, 'assets', 'yos-icon-512.png'));

await mkdir(resolve(webDir, 'data'), { recursive: true });
await cp(resolve(repoDir, 'data', 'yos-assets.json'), resolve(webDir, 'data', 'yos-assets.json'));
await cp(resolve(repoDir, 'data', 'yos-user-tasks.json'), resolve(webDir, 'data', 'yos-user-tasks.json'));

await writeFile(
  resolve(webDir, 'build-info.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), source: 'ProjectY' }, null, 2),
  'utf8'
);

console.log('Prepared bundled web assets for YOS iOS app.');
