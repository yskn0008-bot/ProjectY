export const defaultButtonOrder = Object.freeze([
  'power', 'input', 'quick', 'home', 'back',
  'up', 'left', 'confirm', 'right', 'down',
  'volumeDown', 'mute', 'volumeUp',
  'channelDown', 'channelUp', 'play', 'pause'
]);

export const commandAliases = Object.freeze({
  power: ['PowerOff', 'Power'],
  input: ['Input'],
  home: ['Home'],
  back: ['Return', 'Back'],
  up: ['Up'],
  left: ['Left'],
  confirm: ['Confirm', 'Enter'],
  right: ['Right'],
  down: ['Down'],
  volumeDown: ['VolumeDown'],
  mute: ['Mute'],
  volumeUp: ['VolumeUp'],
  channelDown: ['ChannelDown'],
  channelUp: ['ChannelUp'],
  play: ['Play'],
  pause: ['Pause']
});

export function normalizeHost(value) {
  const host = value.trim().replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  if (!host || /[\s/?#]/.test(host)) {
    throw new Error('テレビのホスト名またはIPアドレスを確認してください。');
  }
  return host;
}

export function parseRemoteControllerInfo(payload) {
  const list = payload?.result?.[1];
  if (!Array.isArray(list)) throw new Error('テレビの対応コマンドを読み取れませんでした。');
  return new Map(
    list
      .filter(item => typeof item?.name === 'string' && typeof item?.value === 'string')
      .map(item => [item.name, item.value])
  );
}

export function resolveCommands(map) {
  return Object.fromEntries(Object.entries(commandAliases).map(([action, names]) => {
    const name = names.find(candidate => map.has(candidate));
    return [action, name ? { name, code: map.get(name) } : null];
  }));
}

export function quickSettingsCandidates(map) {
  return [...map]
    .filter(([name]) => /option|actionmenu|quick|setting/i.test(name))
    .map(([name, code]) => ({ name, code }));
}

const escapeXml = value => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[character]);

export function irccEnvelope(code) {
  if (!code) throw new Error('未対応のコマンドです。');
  return '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">' +
    '<IRCCCode>' + escapeXml(code) + '</IRCCCode>' +
    '</u:X_SendIRCC></s:Body></s:Envelope>';
}

export class SonyRemote {
  constructor(host, secretProvider, fetcher = fetch) {
    this.host = normalizeHost(host);
    this.secretProvider = secretProvider;
    this.fetcher = fetcher;
  }

  async headers(extra = {}) {
    return { ...extra, 'X-Auth-PSK': await this.secretProvider.get() };
  }

  async discover() {
    const response = await this.fetcher('http://' + this.host + '/sony/system', {
      method: 'POST',
      headers: await this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ method: 'getRemoteControllerInfo', params: [], id: 1, version: '1.0' })
    });
    if (!response.ok) {
      throw new Error(response.status === 403 ? 'PSK認証に失敗しました。' : 'テレビへ接続できません。');
    }
    return parseRemoteControllerInfo(await response.json());
  }

  async send(code) {
    const response = await this.fetcher('http://' + this.host + '/sony/ircc', {
      method: 'POST',
      headers: await this.headers({
        'Content-Type': 'text/xml; charset=UTF-8',
        SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'
      }),
      body: irccEnvelope(code)
    });
    if (!response.ok) {
      throw new Error(response.status === 403 ? 'PSK認証に失敗しました。' : 'コマンドを送信できませんでした。');
    }
  }
}

export function cursorPlan(dx, dy, durationMs) {
  const distance = Math.hypot(dx, dy);
  if (distance < 18) return null;
  const action = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
  const velocity = distance / Math.max(durationMs, 1);
  return {
    action,
    repeats: Math.min(8, Math.max(1, Math.floor(distance / 45) + Math.floor(velocity / .7)))
  };
}

export function tapAction(x, y, width, height) {
  if (width <= 0 || height <= 0) return null;
  const horizontal = x / width - .5;
  const vertical = y / height - .5;
  if (Math.hypot(horizontal, vertical) < .2) return 'confirm';
  return Math.abs(horizontal) > Math.abs(vertical)
    ? (horizontal > 0 ? 'right' : 'left')
    : (vertical > 0 ? 'down' : 'up');
}

export class GoogleTvTextAdapter {
  constructor(plugin = globalThis.Capacitor?.Plugins?.YOSGoogleTVRemote) {
    this.plugin = plugin;
  }
  get available() {
    return typeof this.plugin?.startPairing === 'function' &&
      typeof this.plugin?.finishPairing === 'function' &&
      typeof this.plugin?.sendText === 'function';
  }
  requireAvailable() {
    if (!this.available) throw new Error('Google TV文字入力はiOS native版でのみ利用できます。');
  }
  async startPairing(host) {
    this.requireAvailable();
    return this.plugin.startPairing({ host: normalizeHost(host) });
  }
  async finishPairing(code) {
    this.requireAvailable();
    const value = code.trim().toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(value)) throw new Error('6桁のペアリングコードを入力してください。');
    return this.plugin.finishPairing({ code: value });
  }
  async sendText(host, text) {
    this.requireAvailable();
    if (!text) throw new Error('文字を入力してください。');
    return this.plugin.sendText({ host: normalizeHost(host), text });
  }
}
