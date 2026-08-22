import { defaultButtonOrder } from './bravia-core.js';

export const layoutKey = 'yos.bravia.layout.v1';
export const cursorKey = 'yos.bravia.cursor.v1';

function normalizeLayout(value, allowed) {
  if (!value || !Array.isArray(value.order) || !Array.isArray(value.hidden)) return null;
  if (value.order.some(item => !allowed.includes(item))) return null;
  if (value.hidden.some(item => !allowed.includes(item))) return null;

  const order = [...new Set([...value.order, ...allowed])];
  const hidden = [...new Set(value.hidden)].filter(item => order.includes(item));
  return { order, hidden };
}

export function loadLayout(storage, allowed = defaultButtonOrder) {
  try {
    const normalized = normalizeLayout(JSON.parse(storage.getItem(layoutKey)), allowed);
    if (normalized) return normalized;
  } catch {}
  return { order: [...allowed], hidden: [] };
}

export function saveLayout(storage, value, allowed = defaultButtonOrder) {
  const normalized = normalizeLayout(value, allowed);
  if (!normalized) throw new Error('Invalid BRAVIA layout');
  storage.setItem(layoutKey, JSON.stringify(normalized));
  return normalized;
}

export function resetLayout(storage, allowed = defaultButtonOrder) {
  storage.removeItem(layoutKey);
  return { order: [...allowed], hidden: [] };
}

export function loadCursorMode(storage) {
  return storage.getItem(cursorKey) === 'tap' ? 'tap' : 'swipe';
}

export function saveCursorMode(storage, mode) {
  if (!['tap', 'swipe'].includes(mode)) throw new Error('Invalid cursor mode');
  storage.setItem(cursorKey, mode);
}
