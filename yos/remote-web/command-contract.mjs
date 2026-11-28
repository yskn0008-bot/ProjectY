// YOS Remote Web command boundary. Pure validation; no device I/O or secrets.
export const ACTIONS = Object.freeze({
  tv: ['power','input','home','back','up','down','left','right','confirm','volumeDown','mute','volumeUp'],
  light: ['on','off','bright','dark','night'],
  ac: ['cool','dry','heat','stop','tempDown','tempUp'],
  floor: ['on','off','color','brightness','warm','natural','daywhite','daylight']
});
const HEX = /^#[0-9a-fA-F]{6}$/;
export function validateCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('invalid command');
  const {device, action, value} = input;
  if (!Object.hasOwn(ACTIONS, device) || !ACTIONS[device].includes(action)) throw new TypeError('unsupported command');
  if (action === 'color') {
    if (typeof value !== 'string' || !HEX.test(value)) throw new TypeError('invalid color');
    return {device, action, value: value.toLowerCase()};
  }
  if (action === 'brightness') {
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new TypeError('invalid brightness');
    return {device, action, value};
  }
  if (value !== undefined) throw new TypeError('unexpected value');
  return {device, action};
}
