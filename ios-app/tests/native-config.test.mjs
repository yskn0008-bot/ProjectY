import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureNativeProject, upsertPlistString } from '../scripts/configure-native-ios.mjs';

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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid plist fails closed', () => {
  assert.throws(() => upsertPlistString('invalid', 'key', 'value'), /unsupported structure/);
});
