'use strict';

function normalizeVoice(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[、。．，,.!！?？]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function ok(device, action, value = null) {
  return { ok: true, device, action, value };
}

function fail(reason = 'unknown') {
  return { ok: false, reason };
}

function parseHomeVoice(input) {
  const s = normalizeVoice(input);
  if (!s) return fail('empty');

  if (/全部.*消/.test(s) || /^(暑い|寒い|暗い|明るい|寝る|おやすみ)$/.test(s)) {
    return fail('ambiguous');
  }

  if (/エアコン/.test(s)) {
    if (/(消して|切って|オフ|停止)/.test(s)) return ok('ac', 'power_off');
    if (/(つけて|付けて|オン|入れて|運転)/.test(s) && !/度/.test(s)) return ok('ac', 'power_on');

    const temp = s.match(/(1[89]|2\d|30)度/);
    if (temp) return ok('ac', 'set_temperature', Number(temp[1]));

    if (/(1度|一度).*(上げて|あげて)/.test(s) || /温度.*(上げて|あげて)/.test(s)) return ok('ac', 'temperature_up');
    if (/(1度|一度).*(下げて|さげて)/.test(s) || /温度.*(下げて|さげて)/.test(s)) return ok('ac', 'temperature_down');
    return fail('unknown_ac');
  }

  const bareTemp = s.match(/^(1[89]|2\d|30)度(?:に)?(?:して|設定して|設定)?$/);
  if (bareTemp) return ok('ac', 'set_temperature', Number(bareTemp[1]));
  if (/^(1度|一度)(上げて|あげて)$/.test(s)) return ok('ac', 'temperature_up');
  if (/^(1度|一度)(下げて|さげて)$/.test(s)) return ok('ac', 'temperature_down');

  if (/(電気|照明|ライト)/.test(s)) {
    if (/(消して|切って|オフ)/.test(s)) return ok('light', 'power_off');
    if (/(つけて|付けて|オン|点けて|点灯)/.test(s)) return ok('light', 'power_on');
    if (/(明るく|明るめ)/.test(s)) return ok('light', 'brightness_up');
    if (/(暗く|暗め)/.test(s)) return ok('light', 'brightness_down');
    return fail('unknown_light');
  }
  if (/^(明るくして|もっと明るくして)$/.test(s)) return ok('light', 'brightness_up');
  if (/^(暗くして|もっと暗くして)$/.test(s)) return ok('light', 'brightness_down');

  if (/(テレビ|tv)/.test(s)) {
    if (/(つけて|付けて|オン|電源入れて)/.test(s)) return ok('tv', 'power_on');
    if (/(消して|切って|オフ|電源切って)/.test(s)) return ok('tv', 'power_off');
    if (/入力/.test(s)) return ok('tv', 'input');
    if (/ホーム/.test(s)) return ok('tv', 'home');
    if (/戻/.test(s)) return ok('tv', 'back');
  }

  if (/ミュート|消音/.test(s)) return ok('tv', 'mute');
  if (/音量.*(上げ|あげ|大きく)/.test(s)) return ok('tv', 'volume_up');
  if (/音量.*(下げ|さげ|小さく)/.test(s)) return ok('tv', 'volume_down');
  if (/^(ホーム|ホーム開いて)$/.test(s)) return ok('tv', 'home');
  if (/^(戻って|戻る|バック)$/.test(s)) return ok('tv', 'back');
  if (/^(入力|入力切り替えて|入力変えて)$/.test(s)) return ok('tv', 'input');
  if (/^(上|上に|上へ)$/.test(s)) return ok('tv', 'up');
  if (/^(下|下に|下へ)$/.test(s)) return ok('tv', 'down');
  if (/^(左|左に|左へ)$/.test(s)) return ok('tv', 'left');
  if (/^(右|右に|右へ)$/.test(s)) return ok('tv', 'right');
  if (/^(決定|ok|オーケー)$/.test(s)) return ok('tv', 'ok');
  if (/^(再生|再生して)$/.test(s)) return ok('tv', 'play');
  if (/^(一時停止|止めて|ポーズ)$/.test(s)) return ok('tv', 'pause');

  return fail('unknown');
}

module.exports = { normalizeVoice, parseHomeVoice };
