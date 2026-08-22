import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const YOS_APP_GROUP_IDENTIFIER = 'group.jp.yos.onlysystem';

const permissionDescriptions = new Map([
  ['NSCalendarsFullAccessUsageDescription', '本人が確認した予定をカレンダーへ保存するために使用します。'],
  ['NSRemindersFullAccessUsageDescription', '本人が確認した次の一手をリマインダーへ保存するために使用します。'],
  ['NSCalendarsUsageDescription', '本人が確認した予定をカレンダーへ保存するために使用します。'],
  ['NSRemindersUsageDescription', '本人が確認した次の一手をリマインダーへ保存するために使用します。']
]);

const xmlEscape = value => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const regexEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keyPattern = key => new RegExp(`<key>${regexEscape(key)}</key>\\s*<string>[\\s\\S]*?</string>`);

export function upsertPlistString(source, key, value) {
  const replacement = `<key>${key}</key>\n\t<string>${xmlEscape(value)}</string>`;
  const existing = keyPattern(key);
  if (existing.test(source)) return source.replace(existing, replacement);

  const rootEnd = source.lastIndexOf('</dict>');
  if (rootEnd < 0) throw new Error(`Invalid plist: missing root dictionary for ${key}`);
  return `${source.slice(0, rootEnd)}\t${replacement}\n${source.slice(rootEnd)}`;
}

export function upsertPlistArrayValue(source, key, value) {
  const escaped = xmlEscape(value);
  const existing = new RegExp(`(<key>${regexEscape(key)}</key>\\s*<array>)([\\s\\S]*?)(</array>)`);
  const match = source.match(existing);
  if (match) {
    const values = [...match[2].matchAll(/<string>([\s\S]*?)<\/string>/g)].map(item => item[1]);
    if (values.includes(escaped)) return source;
    const body = `${match[2].replace(/\s*$/, '')}\n\t\t<string>${escaped}</string>\n\t`;
    return source.replace(existing, `$1${body}$3`);
  }

  const rootEnd = source.lastIndexOf('</dict>');
  if (rootEnd < 0) throw new Error(`Invalid plist: missing root dictionary for ${key}`);
  const entry = `\t<key>${key}</key>\n\t<array>\n\t\t<string>${escaped}</string>\n\t</array>\n`;
  return `${source.slice(0, rootEnd)}${entry}${source.slice(rootEnd)}`;
}

export function configureXcodeProject(source) {
  const blocks = [...source.matchAll(/buildSettings = \{[\s\S]*?\n\s*\};/g)];
  const targetBlocks = blocks.filter(match => match[0].includes('INFOPLIST_FILE = App/Info.plist;'));
  if (targetBlocks.length === 0) {
    throw new Error('Could not find the generated YOS app build settings. Refusing to modify project.pbxproj.');
  }

  let result = source;
  for (const match of targetBlocks.reverse()) {
    if (match[0].includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) continue;
    const configured = match[0].replace(
      /^(\s*)INFOPLIST_FILE = App\/Info\.plist;$/m,
      '$1CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n$&'
    );
    result = `${result.slice(0, match.index)}${configured}${result.slice(match.index + match[0].length)}`;
  }
  return result;
}

const emptyEntitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`;

async function readIfPresent(path, fallback) {
  try {
    await access(path);
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeWhenChanged(path, before, after) {
  if (before === after) return false;
  await writeFile(path, after, 'utf8');
  return true;
}

export async function configureNativeProject(appDirectory) {
  const infoPath = resolve(appDirectory, 'ios/App/App/Info.plist');
  const entitlementsPath = resolve(appDirectory, 'ios/App/App/App.entitlements');
  const projectPath = resolve(appDirectory, 'ios/App/App.xcodeproj/project.pbxproj');

  const [infoBefore, entitlementsBefore, projectBefore] = await Promise.all([
    readFile(infoPath, 'utf8'),
    readIfPresent(entitlementsPath, emptyEntitlements),
    readFile(projectPath, 'utf8')
  ]);

  let infoAfter = infoBefore;
  for (const [key, value] of permissionDescriptions) {
    infoAfter = upsertPlistString(infoAfter, key, value);
  }
  const entitlementsAfter = upsertPlistArrayValue(
    entitlementsBefore,
    'com.apple.security.application-groups',
    YOS_APP_GROUP_IDENTIFIER
  );
  const projectAfter = configureXcodeProject(projectBefore);

  const changes = await Promise.all([
    writeWhenChanged(infoPath, infoBefore, infoAfter),
    writeWhenChanged(entitlementsPath, entitlementsBefore, entitlementsAfter),
    writeWhenChanged(projectPath, projectBefore, projectAfter)
  ]);
  return changes.filter(Boolean).length;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const appDirectory = resolve(dirname(scriptPath), '..');
  const changed = await configureNativeProject(appDirectory);
  console.log(`Configured YOS native target (${changed} file${changed === 1 ? '' : 's'} updated).`);
}
