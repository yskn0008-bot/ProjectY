import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const description = 'YOSが同じネットワーク上のBRAVIAへ接続するために使用します。';

const escapeXml = value => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

export function upsertPlistString(source, key, value) {
  const escapedKey = key.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('<key>' + escapedKey + '</key>\\s*<string>[\\s\\S]*?</string>');
  const replacement = '<key>' + key + '</key>\n\t<string>' + escapeXml(value) + '</string>';
  if (pattern.test(source)) return source.replace(pattern, replacement);

  const rootEnd = source.lastIndexOf('</dict>');
  if (rootEnd < 0) throw new Error('Generated Info.plist has an unsupported structure.');
  return source.slice(0, rootEnd) + '\t' + replacement + '\n' + source.slice(rootEnd);
}

export async function configureNativeProject(appDirectory) {
  const infoPath = resolve(appDirectory, 'ios/App/App/Info.plist');
  const before = await readFile(infoPath, 'utf8');
  const after = upsertPlistString(before, 'NSLocalNetworkUsageDescription', description);
  if (before === after) return 0;
  await writeFile(infoPath, after, 'utf8');
  return 1;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const appDirectory = resolve(dirname(scriptPath), '..');
  const changed = await configureNativeProject(appDirectory);
  console.log('Configured BRAVIA native permissions (' + changed + ' file updated).');
}
