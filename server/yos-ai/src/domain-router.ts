import type { DomainRoute, YosDomain } from './types.js';

const rules: Array<{ domain: YosDomain; patterns: RegExp[]; live?: boolean }> = [
  { domain: 'translation', patterns: [/通訳/u, /翻訳/u, /英語/u, /韓国語/u, /中国語/u, /台湾語/u] },
  { domain: 'navigation', patterns: [/ナビ/u, /目的地/u, /道案内/u, /Googleマップ/u] },
  { domain: 'taxi-live', patterns: [/営業中/u, /今どこ/u, /どこへ向か/u, /乗車中/u, /降車/u, /空車/u], live: true },
  { domain: 'taxi-pre', patterns: [/営業前/u, /今日の営業/u, /営業戦略/u, /売上目標/u] },
  { domain: 'taxi-post', patterns: [/営業後/u, /営業終了/u, /日報/u, /振り返/u] },
  { domain: 'taxi-research', patterns: [/Taxi Lab/iu, /タクシー研究/u, /KPI/iu, /実車率/u, /空車率/u, /Project75/iu] },
  { domain: 'system', patterns: [/YOS改善/iu, /ProjectY/iu, /開発/u, /実装/u, /コード/u, /仕様/u, /API/iu, /GitHub/iu] },
  { domain: 'money', patterns: [/お金/u, /家計/u, /返済/u, /資産/u, /収入/u, /支出/u] },
  { domain: 'life', patterns: [/健康/u, /体調/u, /生活/u, /人間関係/u, /恋愛/u, /部屋/u, /疲/u] },
  { domain: 'idea', patterns: [/アイデア/u, /思いつ/u, /案/u, /作りたい/u] },
  { domain: 'external', patterns: [/最新/u, /今日の天気/u, /ニュース/u, /調べて/u, /検索/u] }
];

export function routeDomain(text: string): DomainRoute {
  const matched: Array<{ domain: YosDomain; live: boolean; reason: string }> = [];

  for (const rule of rules) {
    const pattern = rule.patterns.find((candidate) => candidate.test(text));
    if (pattern) {
      matched.push({ domain: rule.domain, live: rule.live ?? false, reason: pattern.source });
    }
  }

  if (matched.length === 0) {
    return {
      primary: 'yos',
      related: [],
      liveMode: false,
      reasons: ['専門領域を特定できないためYOS全体で判断']
    };
  }

  const [first, ...rest] = matched;
  if (!first) throw new Error('domain routing invariant failed');

  return {
    primary: first.domain,
    related: [...new Set(rest.map((item) => item.domain))],
    liveMode: matched.some((item) => item.live),
    reasons: matched.map((item) => `${item.domain}:${item.reason}`)
  };
}
