import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  YOS_APP_GROUP_IDENTIFIER,
  configureNativeProject,
  configureXcodeProject
} from '../scripts/configure-native.mjs';

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleDisplayName</key>
\t<string>YOS</string>
</dict>
</plist>
`;

const project = `/* Begin XCBuildConfiguration section */
\t\tAA /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tINFOPLIST_FILE = App/Info.plist;
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\tBB /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tINFOPLIST_FILE = App/Info.plist;
\t\t\t};
\t\t\tname = Release;
\t\t};
/* End XCBuildConfiguration section */
`;

test('native configuration is idempotent and preserves existing plist values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yos-native-config-'));
  const app = join(root, 'ios', 'App', 'App');
  const xcode = join(root, 'ios', 'App', 'App.xcodeproj');
  await Promise.all([mkdir(app, { recursive: true }), mkdir(xcode, { recursive: true })]);
  await Promise.all([
    writeFile(join(app, 'Info.plist'), plist),
    writeFile(join(xcode, 'project.pbxproj'), project)
  ]);

  try {
    assert.equal(await configureNativeProject(root), 3);
    assert.equal(await configureNativeProject(root), 0);

    const [info, entitlements, configuredProject] = await Promise.all([
      readFile(join(app, 'Info.plist'), 'utf8'),
      readFile(join(app, 'App.entitlements'), 'utf8'),
      readFile(join(xcode, 'project.pbxproj'), 'utf8')
    ]);
    assert.match(info, /<key>CFBundleDisplayName<\/key>\s*<string>YOS<\/string>/);
    for (const key of [
      'NSCalendarsFullAccessUsageDescription',
      'NSRemindersFullAccessUsageDescription',
      'NSCalendarsUsageDescription',
      'NSRemindersUsageDescription'
    ]) {
      assert.equal((info.match(new RegExp(`<key>${key}</key>`, 'g')) || []).length, 1);
    }
    assert.match(entitlements, new RegExp(`<string>${YOS_APP_GROUP_IDENTIFIER}</string>`));
    assert.equal((configuredProject.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('native configuration refuses an unknown generated Xcode layout', () => {
  assert.throws(() => configureXcodeProject('buildSettings = {\n};\n'), /Refusing to modify/);
});
