import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configureNativeProject,
  upsertPlistBooleanInDictionary,
  upsertPlistString
} from '../scripts/configure-native-ios.mjs';

const plist = '<?xml version="1.0"?>\n<plist version="1.0">\n<dict>\n' +
  '\t<key>CFBundleDisplayName</key>\n\t<string>YOS</string>\n</dict>\n</plist>\n';

test('local-network permission is added once without replacing existing values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yos-bravia-native-'));
  const app = join(root, 'ios', 'App', 'App');
  await mkdir(app, { recursive: true });
  await writeFile(join(app, 'Info.plist'), plist);
  try {
    assert.equal(await configureNativeProject(root), 1);
    assert.equal(await configureNativeProject(root), 0);
    const value = await readFile(join(app, 'Info.plist'), 'utf8');
    assert.match(value, /<key>CFBundleDisplayName<\/key>\s*<string>YOS<\/string>/);
    assert.equal((value.match(/NSLocalNetworkUsageDescription/g) || []).length, 1);
    assert.equal((value.match(/NSAppTransportSecurity/g) || []).length, 1);
    assert.equal((value.match(/NSAllowsLocalNetworking/g) || []).length, 1);
    assert.match(value, /<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid plist fails closed', () => {
  assert.throws(() => upsertPlistString('invalid', 'key', 'value'), /unsupported structure/);
});

test('local networking preserves existing App Transport Security values', () => {
  const existing = plist.replace(
    '</dict>\n</plist>',
    '\t<key>NSAppTransportSecurity</key>\n\t<dict>\n' +
      '\t\t<key>NSAllowsArbitraryLoads</key>\n\t\t<false/>\n\t</dict>\n</dict>\n</plist>'
  );
  const value = upsertPlistBooleanInDictionary(
    existing,
    'NSAppTransportSecurity',
    'NSAllowsLocalNetworking',
    true
  );
  assert.match(value, /<key>NSAllowsArbitraryLoads<\/key>\s*<false\/>/);
  assert.match(value, /<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/);
});

test('Capacitor native HTTP patches WebView fetch for BRAVIA requests', async () => {
  const value = await readFile(new URL('../capacitor.config.ts', import.meta.url), 'utf8');
  assert.match(value, /CapacitorHttp:\s*\{\s*enabled:\s*true/);
});
