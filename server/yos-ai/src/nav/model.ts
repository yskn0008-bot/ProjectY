export interface NavModel {
  version: string;
  generatedAt: string;
  sourcePeriod: {from: string; to: string};
  confirmedClassifiedRides: number;
  sourceRows: number;
  formula: {demand: number; fare: number; chain: number; pace: number};
  zoneProfiles: Record<string, ZoneProfile>;
  segments: Record<DayGroup, Record<TimeBin, Record<string, SegmentMetric>>>;
}

export interface ZoneProfile {
  score: number;
  wait: number;
  latitude: number;
  longitude: number;
  label: string;
  destination: string;
  overall: {
    n: number;
    avg: number;
    median: number;
    chain: number | null;
    within30: number | null;
    gap: number | null;
    avgNext: number | null;
  };
}

export interface SegmentMetric {
  score: number;
  n: number;
  avgFare: number;
  medianFare: number;
  confidence: number;
  label: string;
  destination: string;
}

type DayGroup = 'weekday' | 'weekend';
type TimeBin = '14-18' | '18-20' | '20-22' | '22-24' | '0-2' | '2-5';

interface Ride {
  businessDate: string;
  pickupMinute: number;
  pickup: string;
  dropoff: string;
  fare: number;
  pickupZone: string;
  dropoffZone: string | null;
}

interface ZoneDefinition {
  key: string;
  label: string;
  destination: string;
  latitude: number;
  longitude: number;
  wait: number;
  terms: string[];
}

interface RideWithNext extends Ride {
  next: Ride | null;
  gapToNext: number | null;
}

const FORMULA = {demand: 45, fare: 25, chain: 20, pace: 10} as const;
const DAY_GROUPS: DayGroup[] = ['weekday', 'weekend'];
const TIME_BINS: TimeBin[] = ['14-18', '18-20', '20-22', '22-24', '0-2', '2-5'];

const ZONES: ZoneDefinition[] = [
  zone('PARCO', 'PARCO CITY', 'サンエー浦添西海岸 PARCO CITY', 26.263, 127.699, ['parco', 'パルコ']),
  zone('那覇南・空港', '小禄・赤嶺', '赤嶺駅', 26.193, 127.666, ['空港', '小禄', '赤嶺', '鏡水', '金城', '具志', '宇栄原', '安次嶺', '奥武山', '山下', '鏡原']),
  zone('浦添', '浦添', '浦添市屋富祖', 26.256, 127.708, ['浦添', '牧港', '港川', '屋富祖', '伊祖', '城間', '内間', '勢理客', '宮城', '経塚', '前田', '仲間', '大平', '西洲', '当山', '仲西']),
  zone('宜野湾', '宜野湾', '宜野湾市大山', 26.281, 127.757, ['宜野湾', '大山', '真志喜', '伊佐', '普天間', '野嵩', '新城', '我如古', '真栄原', '嘉数', '大謝名', '志真志', '長田', '佐真下', '愛知', '上原', '喜友名', '北上原', '宇地泊', '棚原', '西原']),
  zone('北谷', '北谷', '北谷町美浜', 26.315, 127.757, ['北谷', '美浜', '桑江', '伊平', '北前', '上勢頭', '吉原', '謝苅', '砂辺', '浜川']),
  zone('沖縄市', '沖縄市', '沖縄市上地', 26.334, 127.799, ['沖縄市', '中央', '上地', '山内', '島袋', '園田', '胡屋', '諸見里', '比屋根', '美里', '美原', '安慶田', '照屋', '泡瀬', '山里', '八重島', '知花', '越来']),
  zone('南部', '豊見城・南部', '豊見城市豊崎', 26.171, 127.667, ['豊見城', '豊崎', '糸満', '西崎', '潮平', '座波', '座安', '瀬長', '津嘉山', '南風原', '与那原', '翁長', '兼城', '名城', '潮崎']),
  zone('中北部', '中北部', 'うるま市', 26.43, 127.79, ['うるま', '恩納', '金武', '辺野古', '赤道', '平良川', '江洲', '高江洲', '石川', '名護', '喜屋武']),
  zone('那覇中心', '那覇中心', '那覇市久茂地', 26.2167, 127.6847, ['那覇', '久茂地', '松山', '若狭', '牧志', '松尾', '前島', '泊', '辻', '久米', '泉崎', '西', '東町', '安里', '壺屋', '壺川', '古波蔵', 'おもろまち', '銘苅', '天久', '上之屋', '楚辺', '大道', '松川', '三原', '国場', '与儀', '寄宮', '真嘉比', '古島', '曙', '安謝', '首里', '石嶺', '繁多川', '識名', '旭橋'])
];

export function buildNavModel(rows: unknown[][], generatedAt = new Date().toISOString()): NavModel {
  const rides = parseRides(rows);
  if (rides.length === 0) throw new Error('No classified rides are available');

  const linked = linkRides(rides);
  const globalAverageFare = average(rides.map((ride) => ride.fare));
  const zoneProfiles: Record<string, ZoneProfile> = {};

  for (const definition of ZONES) {
    const zoneRides = linked.filter((ride) => ride.pickupZone === definition.key);
    zoneProfiles[definition.key] = buildZoneProfile(definition, zoneRides, linked, globalAverageFare);
  }

  const segments = emptySegments();
  for (const group of DAY_GROUPS) {
    for (const bin of TIME_BINS) {
      const segmentRides = linked.filter((ride) => dayGroup(ride.businessDate) === group && timeBin(ride.pickupMinute) === bin);
      const counts = new Map<string, number>();
      for (const ride of segmentRides) counts.set(ride.pickupZone, (counts.get(ride.pickupZone) ?? 0) + 1);
      const maxCount = Math.max(1, ...counts.values());

      for (const definition of ZONES) {
        const zoneRides = segmentRides.filter((ride) => ride.pickupZone === definition.key);
        if (zoneRides.length === 0) continue;
        const profile = zoneProfiles[definition.key];
        if (!profile) continue;
        segments[group][bin][definition.key] = buildSegmentMetric(
          definition,
          zoneRides,
          profile,
          maxCount,
          globalAverageFare
        );
      }
    }
  }

  const dates = rides.map((ride) => ride.businessDate).sort();
  const firstDate = dates[0];
  const lastDate = dates.at(-1);
  if (!firstDate || !lastDate) throw new Error('Source period is unavailable');

  return {
    version: '2.0',
    generatedAt,
    sourcePeriod: {from: firstDate, to: lastDate},
    confirmedClassifiedRides: rides.length,
    sourceRows: Math.max(0, rows.length - 1),
    formula: {...FORMULA},
    zoneProfiles,
    segments
  };
}

function parseRides(rows: unknown[][]): Ride[] {
  if (rows.length < 2) return [];
  const header = rows[0]?.map((value) => normalize(value)) ?? [];
  const indexes = {
    date: findHeader(header, ['営業日', '日付']),
    time: findHeader(header, ['乗車時刻', '乗車時間']),
    pickup: findHeader(header, ['乗車地', '乗車場所']),
    dropoff: findHeader(header, ['降車地', '降車場所']),
    fare: findHeader(header, ['売上', '運賃'])
  };
  if (Object.values(indexes).some((index) => index < 0)) throw new Error('Required trip-history columns are missing');

  const rides: Ride[] = [];
  for (const row of rows.slice(1)) {
    const rawDate = cleanCell(row[indexes.date]);
    const rawTime = cleanCell(row[indexes.time]);
    const rawPickup = cleanCell(row[indexes.pickup]);
    const rawDropoff = cleanCell(row[indexes.dropoff]);
    const pickupUncertain = /[?？]/u.test(rawPickup);
    const timeUncertain = /[?？]/u.test(rawTime);
    const pickup = pickupUncertain ? '' : cleanPlace(rawPickup);
    const dropoff = /[?？]/u.test(rawDropoff) ? '' : cleanPlace(rawDropoff);
    const fare = parseFare(row[indexes.fare]);
    const businessDate = parseDate(rawDate);
    const pickupMinute = parseMinute(rawTime);
    if (!businessDate || timeUncertain || pickupMinute === null || !pickup || fare === null) continue;
    const pickupZone = classifyZone(pickup);
    if (!pickupZone) continue;
    rides.push({
      businessDate,
      pickupMinute,
      pickup,
      dropoff,
      fare,
      pickupZone,
      dropoffZone: dropoff ? classifyZone(dropoff) : null
    });
  }
  return rides.sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.pickupMinute - b.pickupMinute);
}

function linkRides(rides: Ride[]): RideWithNext[] {
  return rides.map((ride, index) => {
    const next = rides[index + 1] ?? null;
    const sameBusinessDate = next?.businessDate === ride.businessDate;
    const gapToNext = sameBusinessDate && next ? Math.max(0, next.pickupMinute - ride.pickupMinute) : null;
    return {...ride, next: sameBusinessDate ? next : null, gapToNext};
  });
}

function buildZoneProfile(
  definition: ZoneDefinition,
  rides: RideWithNext[],
  allRides: RideWithNext[],
  globalAverageFare: number
): ZoneProfile {
  const fares = rides.map((ride) => ride.fare);
  const chainEligible = rides.filter((ride) => ride.dropoffZone && ride.next && ride.gapToNext !== null && ride.gapToNext <= 120);
  const chainSuccess = chainEligible.filter((ride) => ride.next?.pickupZone === ride.dropoffZone);
  const nextEligible = rides.filter((ride) => ride.next && ride.gapToNext !== null && ride.gapToNext <= 180);
  const gaps = nextEligible.map((ride) => ride.gapToNext).filter((value): value is number => value !== null);
  const nextFares = nextEligible.map((ride) => ride.next?.fare).filter((value): value is number => typeof value === 'number');
  const n = rides.length;
  const demand = scaleDemand(n, Math.max(1, ...ZONES.map((zone) => allRides.filter((ride) => ride.pickupZone === zone.key).length)));
  const fare = scaleFare(average(fares), globalAverageFare);
  const chain = percentage(chainSuccess.length, chainEligible.length);
  const pace = scalePace(average(gaps));
  const weighted = weightedScore(demand, fare, chain ?? 45, pace);

  return {
    score: mapWeightedScore(weighted, n),
    wait: definition.wait,
    latitude: definition.latitude,
    longitude: definition.longitude,
    label: definition.label,
    destination: definition.destination,
    overall: {
      n,
      avg: round(average(fares)),
      median: round(median(fares)),
      chain,
      within30: percentage(gaps.filter((gap) => gap <= 30).length, gaps.length),
      gap: gaps.length ? round1(average(gaps)) : null,
      avgNext: nextFares.length ? round(average(nextFares)) : null
    }
  };
}

function buildSegmentMetric(
  definition: ZoneDefinition,
  rides: RideWithNext[],
  profile: ZoneProfile,
  maxCount: number,
  globalAverageFare: number
): SegmentMetric {
  const fares = rides.map((ride) => ride.fare);
  const gaps = rides.map((ride) => ride.gapToNext).filter((value): value is number => value !== null && value <= 180);
  const demand = scaleDemand(rides.length, maxCount);
  const fare = scaleFare(average(fares), globalAverageFare);
  const chain = profile.overall.chain ?? 45;
  const pace = scalePace(average(gaps));
  const weighted = weightedScore(demand, fare, chain, pace);
  const topPlaces = mostCommon(rides.map((ride) => ride.pickup), 2);
  const label = topPlaces.length ? topPlaces.join('・') : definition.label;
  const destination = destinationFor(topPlaces[0] ?? '', definition);

  return {
    score: mapWeightedScore(weighted, rides.length),
    n: rides.length,
    avgFare: round(average(fares)),
    medianFare: round(median(fares)),
    confidence: confidence(rides.length),
    label,
    destination
  };
}

function zone(
  key: string,
  label: string,
  destination: string,
  latitude: number,
  longitude: number,
  terms: string[]
): ZoneDefinition {
  return {key, label, destination, latitude, longitude, wait: 10, terms: terms.map((term) => normalize(term))};
}

function classifyZone(place: string): string | null {
  const value = normalize(place);
  for (const definition of ZONES) {
    if (definition.terms.some((term) => value.includes(term))) return definition.key;
  }
  return null;
}

function dayGroup(date: string): DayGroup {
  const day = new Date(`${date}T12:00:00+09:00`).getUTCDay();
  return day >= 1 && day <= 4 ? 'weekday' : 'weekend';
}

function timeBin(minute: number): TimeBin {
  const hour = Math.floor((minute % 1440) / 60);
  if (hour >= 14 && hour < 18) return '14-18';
  if (hour >= 18 && hour < 20) return '18-20';
  if (hour >= 20 && hour < 22) return '20-22';
  if (hour >= 22) return '22-24';
  if (hour < 2) return '0-2';
  if (hour < 5) return '2-5';
  return '14-18';
}

function parseMinute(value: string): number | null {
  const clean = value.replace(/[?？]/gu, '').trim();
  const match = /^(\d{1,2}):(\d{2})$/u.exec(clean);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour < 8 ? hour + 24 : hour) * 60 + minute;
}

function parseDate(value: string): string | null {
  const match = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/u.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseFare(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const clean = cleanCell(value).replace(/[¥￥,\s]/gu, '');
  const fare = Number(clean);
  return Number.isFinite(fare) && fare > 0 && fare <= 200_000 ? fare : null;
}

function cleanPlace(value: unknown): string {
  const clean = cleanCell(value).replace(/[?？]/gu, '').trim();
  if (!clean || /^(不明|なし|未確認|-|―)$/u.test(clean)) return '';
  return clean;
}

function cleanCell(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function findHeader(header: string[], candidates: string[]): number {
  const normalized = candidates.map((candidate) => normalize(candidate));
  return header.findIndex((value) => normalized.includes(value));
}

function normalize(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

function destinationFor(place: string, definition: ZoneDefinition): string {
  if (!place) return definition.destination;
  if (definition.key === '那覇中心') return `那覇市${place}`;
  if (definition.key === '那覇南・空港') return place.includes('空港') ? '那覇空港' : `那覇市${place}`;
  if (definition.key === '浦添') return `浦添市${place}`;
  if (definition.key === '宜野湾') return `宜野湾市${place}`;
  if (definition.key === '北谷') return `北谷町${place}`;
  if (definition.key === '沖縄市') return `沖縄市${place}`;
  return definition.destination;
}

function emptySegments(): Record<DayGroup, Record<TimeBin, Record<string, SegmentMetric>>> {
  const createBins = (): Record<TimeBin, Record<string, SegmentMetric>> => ({
    '14-18': {},
    '18-20': {},
    '20-22': {},
    '22-24': {},
    '0-2': {},
    '2-5': {}
  });
  return {weekday: createBins(), weekend: createBins()};
}

function weightedScore(demand: number, fare: number, chain: number, pace: number): number {
  return (
    demand * FORMULA.demand +
    fare * FORMULA.fare +
    chain * FORMULA.chain +
    pace * FORMULA.pace
  ) / 100;
}

function mapWeightedScore(weighted: number, n: number): number {
  const sparsePenalty = n < 3 ? 4 : n < 6 ? 2 : 0;
  return clamp(round(35 + weighted * 0.5 - sparsePenalty), 20, 95);
}

function scaleDemand(n: number, maxCount: number): number {
  if (n <= 0 || maxCount <= 0) return 0;
  return clamp((Math.log1p(n) / Math.log1p(maxCount)) * 100, 0, 100);
}

function scaleFare(value: number, globalAverage: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(globalAverage) || globalAverage <= 0) return 40;
  return clamp(50 + ((value / globalAverage) - 1) * 50, 0, 100);
}

function scalePace(gap: number): number {
  if (!Number.isFinite(gap) || gap <= 0) return 40;
  return clamp(100 - Math.max(0, gap - 10) * 2.5, 0, 100);
}

function confidence(n: number): number {
  return clamp(round(100 * (1 - Math.exp(-n / 6))), 0, 100);
}

function mostCommon(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .slice(0, limit)
    .map(([value]) => value);
}

function average(values: number[]): number {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle];
  if (current === undefined) return 0;
  if (sorted.length % 2 === 1) return current;
  const previous = sorted[middle - 1];
  return previous === undefined ? current : (previous + current) / 2;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round1((numerator / denominator) * 100) : null;
}

function round(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function round1(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
