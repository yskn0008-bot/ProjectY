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

const escapeRegExp = value => value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

export function upsertPlistString(source, key, value) {
  const escapedKey = escapeRegExp(key);
  const pattern = new RegExp('<key>' + escapedKey + '</key>\\s*<string>[\\s\\S]*?</string>');
  const replacement = '<key>' + key + '</key>\n\t<string>' + escapeXml(value) + '</string>';
  if (pattern.test(source)) return source.replace(pattern, replacement);

  const rootEnd = source.lastIndexOf('</dict>');
  if (rootEnd < 0) throw new Error('Generated Info.plist has an unsupported structure.');
  return source.slice(0, rootEnd) + '\t' + replacement + '\n' + source.slice(rootEnd);
}

function dictionaryRange(source, key) {
  const keyToken = '<key>' + key + '</key>';
  const keyStart = source.indexOf(keyToken);
  if (keyStart < 0) return null;
  const valueStart = keyStart + keyToken.length;
  const openStart = source.indexOf('<dict>', valueStart);
  if (openStart < 0 || source.slice(valueStart, openStart).trim()) {
    throw new Error('Generated Info.plist has an unsupported dictionary value.');
  }
  const token = /<\/?dict>/g;
  token.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = token.exec(source))) {
    if (match[0] === '<dict>') depth += 1;
    else depth -= 1;
    if (depth === 0) return { openEnd: openStart + '<dict>'.length, closeStart: match.index };
  }
  throw new Error('Generated Info.plist has an unterminated dictionary.');
}

export function upsertPlistBooleanInDictionary(source, dictionaryKey, key, value) {
  const boolean = value ? '<true/>' : '<false/>';
  const range = dictionaryRange(source, dictionaryKey);
  const replacement = '<key>' + key + '</key>\n\t\t' + boolean;
  if (range) {
    const content = source.slice(range.openEnd, range.closeStart);
    const pattern = new RegExp('<key>' + escapeRegExp(key) + '</key>\\s*<(?:true|false)\\s*/>');
    if (pattern.test(content)) {
      return source.slice(0, range.openEnd) + content.replace(pattern, replacement) + source.slice(range.closeStart);
    }
    return source.slice(0, range.closeStart) + '\t\t' + replacement + '\n\t' + source.slice(range.closeStart);
  }

  const rootEnd = source.lastIndexOf('</dict>');
  if (rootEnd < 0) throw new Error('Generated Info.plist has an unsupported structure.');
  const block = '\t<key>' + dictionaryKey + '</key>\n\t<dict>\n\t\t' + replacement + '\n\t</dict>\n';
  return source.slice(0, rootEnd) + block + source.slice(rootEnd);
}

export async function configureNativeProject(appDirectory) {
  const infoPath = resolve(appDirectory, 'ios/App/App/Info.plist');
  const before = await readFile(infoPath, 'utf8');
  let after = upsertPlistString(before, 'NSLocalNetworkUsageDescription', description);
  after = upsertPlistBooleanInDictionary(after, 'NSAppTransportSecurity', 'NSAllowsLocalNetworking', true);
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
