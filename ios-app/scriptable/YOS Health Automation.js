// Variables used by Scriptable.
// icon-color: green; icon-glyph: heart;
// YOS_SCRIPT_NAME: YOS Health Automation
// YOS Health Automation — Scriptable / iPhone Shortcuts
// Purpose: sleep-mode-based hydration reminders only.
// Does NOT access HealthKit, control Sleep Cycle, or modify other YOS scripts.
const YOS_HEALTH = Object.freeze({
  scriptName: 'YOS Health Automation',
  waterIds: [1, 2, 3, 4].map(i => `yos.health.water.awake.${i}`),
  offsetMinutes: [120, 300, 480, 660],
});

function getMode() {
  const raw = typeof args === 'object' && args !== null
    ? (args.shortcutParameter ?? (args.queryParameters && args.queryParameters.mode))
    : null;
  if (typeof raw === 'string') return raw.trim().toLowerCase();
  if (raw && typeof raw === 'object' && typeof raw.mode === 'string') return raw.mode.trim().toLowerCase();
  return 'menu';
}

async function cancelWater() {
  // NEVER call removeAllPending(): it would delete notifications from other YOS scripts.
  await Notification.removePending(YOS_HEALTH.waterIds);
}

async function scheduleWater(now = new Date()) {
  await cancelWater();
  const scheduled = [];
  try {
    for (let index = 0; index < YOS_HEALTH.offsetMinutes.length; index++) {
      const item = new Notification();
      item.identifier = YOS_HEALTH.waterIds[index];
      item.threadIdentifier = 'yos-health-water';
      item.title = '水分補給の目安';
      item.body = '喉の渇きや活動量に合わせて、水分を補給しよう。';
      item.sound = null;
      item.setTriggerDate(new Date(now.getTime() + YOS_HEALTH.offsetMinutes[index] * 60000));
      await item.schedule();
      scheduled.push(item.identifier);
    }
  } catch (error) {
    // Fail closed: no partial reminder set remains, other scripts stay untouched.
    await cancelWater();
    throw error;
  }
  return scheduled.length;
}

async function showMenu() {
  const menu = new Alert();
  menu.title = 'YOS Health';
  menu.message = '起床後の水分通知を管理します。';
  menu.addAction('水分通知を設定');
  menu.addAction('水分通知を止める');
  menu.addCancelAction('閉じる');
  const choice = await menu.presentSheet();
  if (choice === 0) {
    await scheduleWater();
  } else if (choice === 1) {
    await cancelWater();
  }
}

async function main() {
  const mode = getMode();
  if (mode === 'wake' || mode === 'sleep_off') {
    const count = await scheduleWater();
    Script.setShortcutOutput(`hydration_scheduled:${count}`);
  } else if (mode === 'sleep' || mode === 'sleep_on') {
    await cancelWater();
    Script.setShortcutOutput('hydration_cancelled');
  } else if (mode === 'menu') {
    await showMenu();
    Script.setShortcutOutput('menu_closed');
  } else {
    throw new Error('Unknown YOS Health mode: ' + mode);
  }
}

try {
  await main();
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  console.error('YOS Health automation failed: ' + message);
  Script.setShortcutOutput('health_error:' + message);
}
Script.complete();
