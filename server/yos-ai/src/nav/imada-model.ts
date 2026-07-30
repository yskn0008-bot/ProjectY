import {buildNavModel, type NavModel, type SegmentMetric, type ZoneProfile} from './model.js';

type DayGroup = 'weekday' | 'weekend';
type TimeBin = '14-18' | '18-20' | '20-22' | '22-24' | '0-2' | '2-5';
type IdleBasis = 'actual' | 'pickup-interval' | 'none';
type EfficiencySource = 'segment' | 'zone-overall' | 'none';

export interface ImadaEfficiencyMetric {
  predictedIdleMinutes: number | null;
  predictedCycleMinutes: number | null;
  tripsPerHour: number | null;
  expectedHourlyRevenue: number | null;
  noResponseRisk: number | null;
  idleBasis: IdleBasis;
  efficiencySource: EfficiencySource;
  actualIdleSamples: number;
  sameZoneSamples: number;
  opportunitySamples: number;
  efficiencyConfidence: number;
}

export interface ImadaZoneProfile extends Omit<ZoneProfile, 'overall'> {
  overall: ZoneProfile['overall'] & ImadaEfficiencyMetric;
}

export interface ImadaSegmentMetric extends SegmentMetric, ImadaEfficiencyMetric {}

export interface ImadaNavModel extends Omit<NavModel, 'version' | 'formula' | 'zoneProfiles' | 'segments'> {
  version: string;
  formula: {idle: number; turns: number; hourlyRevenue: number};
  decisionPriority: ['predictedIdleMinutes', 'tripsPerHour', 'expectedHourlyRevenue'];
  operationalRules: {
    noResponseMinutes: number;
    lowFareThreshold: number;
    consecutiveLowFareLimit: number;
    halfHourSalesThreshold: number;
  };
  zoneProfiles: Record<string, ImadaZoneProfile>;
  segments: Record<DayGroup, Record<TimeBin, Record<string, ImadaSegmentMetric>>>;
}

interface ParsedRide {
  businessDate: string;
  pickupMinute: number;
  dropoffMinute: number | null;
  pickupZone: string;
  dropoffZone: string | null;
  fare: number;
}

interface EfficiencyObservation {
  zone: string;
  group: DayGroup;
  bin: TimeBin;
  pickupInterval: number;
  actualIdle: number | null;
  nextFare: number;
  sameZone: boolean;
}

interface MetricDraft extends ImadaEfficiencyMetric {
  rankingWaitMinutes: number | null;
}

const FORMULA = {idle: 50, turns: 30, hourlyRevenue: 20} as const;
const RULES = {
  noResponseMinutes: 15,
  lowFareThreshold: 1_000,
  consecutiveLowFareLimit: 2,
  halfHourSalesThreshold: 2_000
} as const;
const DAY_GROUPS: DayGroup[] = ['weekday', 'weekend'];
const TIME_BINS: TimeBin[] = ['14-18', '18-20', '20-22', '22-24', '0-2', '2-5'];

const ZONE_TERMS: Record<string, string[]> = {
  PARCO: ['parco', 'パルコ'],
  '那覇南・空港': ['空港', '小禄', '赤嶺', '鏡水', '金城', '具志', '宇栄原', '安次嶺', '奥武山', '山下', '鏡原'],
  浦添: ['浦添', '牧港', '港川', '屋富祖', '伊祖', '城間', '内間', '勢理客', '宮城', '経塚', '前田', '仲間', '大平', '西洲', '当山', '仲西'],
  宜野湾: ['宜野湾', '大山', '真志喜', '伊佐', '普天間', '野嵩', '新城', '我如古', '真栄原', '嘉数', '大謝名', '志真志', '長田', '佐真下', '愛知', '上原', '喜友名', '北上原', '宇地泊', '棚原', '西原'],
  北谷: ['北谷', '美浜', '桑江', '伊平', '北前', '上勢頭', '吉原', '謝苅', '砂辺', '浜川'],
  沖縄市: ['沖縄市', '中央', '上地', '山内', '島袋', '園田', '胡屋', '諸見里', '比屋根', '美里', '美原', '安慶田', '照屋', '泡瀬', '山里', '八重島', '知花', '越来'],
  南部: ['豊見城', '豊崎', '糸満', '西崎', '潮平', '座波', '座安', '瀬長', '津嘉山', '南風原', '与那原', '翁長', '兼城', '名城', '潮崎'],
  中北部: ['うるま', '恩納', '金武', '辺野古', '赤道', '平良川', '江洲', '高江洲', '石川', '名護', '喜屋武'],
  那覇中心: ['那覇', '久茂地', '松山', '若狭', '牧志', '松尾', '前島', '泊', '辻', '久米', '泉崎', '西', '東町', '安里', '壺屋', '壺川', '古波蔵', 'おもろまち', '銘苅', '天久', '上之屋', '楚辺', '大道', '松川', '三原', '国場', '与儀', '寄宮', '真嘉比', '古島', '曙', '安謝', '首里', '石嶺', '繁多川', '識名', '旭橋']
};

export function buildImadaNavModel(rows: unknown[][], generatedAt = new Date().toISOString()): ImadaNavModel {
  const base = buildNavModel(rows, generatedAt);
  const rides = parseRides(rows);
  const observations = buildObservations(rides);
  const globalMetric = metricFor(observations, 'segment');
  const globalHourlyRevenue = globalMetric.expectedHourlyRevenue ?? 1;
  const zoneProfiles: Record<string, ImadaZoneProfile> = {};
  const segments = emptySegments();

  for (const [zone, profile] of Object.entries(base.zoneProfiles)) {
    const zoneObservations = observations.filter((observation) => observation.zone === zone);
    const overall = metricFor(zoneObservations, 'zone-overall');
    zoneProfiles[zone] = {
      ...profile,
      score: imadaScore(overall, globalHourlyRevenue, profile.score, profile.overall.n),
      overall: {...profile.overall, ...withoutRankingWait(overall)}
    };
  }

  for (const group of DAY_GROUPS) {
    for (const bin of TIME_BINS) {
      for (const [zone, baseMetric] of Object.entries(base.segments[group][bin])) {
        const zoneOverall = observations.filter((observation) => observation.zone === zone);
        const segmentObservations = zoneOverall.filter(
          (observation) => observation.group === group && observation.bin === bin
        );
        const segmentDraft = metricFor(segmentObservations, 'segment');
        const overallDraft = metricFor(zoneOverall, 'zone-overall');
        const chosen = segmentDraft.sameZoneSamples >= 2 || segmentDraft.actualIdleSamples >= 1
          ? segmentDraft
          : overallDraft;
        segments[group][bin][zone] = {
          ...baseMetric,
          score: imadaScore(chosen, globalHourlyRevenue, baseMetric.score, baseMetric.n),
          confidence: Math.min(baseMetric.confidence, chosen.efficiencyConfidence || baseMetric.confidence),
          ...withoutRankingWait(chosen)
        };
      }
    }
  }

  return {
    ...base,
    version: '3.0-imada-v47',
    formula: {...FORMULA},
    decisionPriority: ['predictedIdleMinutes', 'tripsPerHour', 'expectedHourlyRevenue'],
    operationalRules: {...RULES},
    zoneProfiles,
    segments
  };
}

function parseRides(rows: unknown[][]): ParsedRide[] {
  if (rows.length < 2) return [];
  const header = rows[0]?.map((value) => normalize(value)) ?? [];
  const dateIndex = findHeader(header, ['営業日', '日付']);
  const pickupTimeIndex = findHeader(header, ['乗車時刻', '乗車時間']);
  const dropoffTimeIndex = findHeader(header, ['降車時刻', '降車時間']);
  const pickupIndex = findHeader(header, ['乗車地', '乗車場所']);
  const dropoffIndex = findHeader(header, ['降車地', '降車場所']);
  const fareIndex = findHeader(header, ['売上', '運賃']);
  if ([dateIndex, pickupTimeIndex, pickupIndex, dropoffIndex, fareIndex].some((index) => index < 0)) return [];

  const rides: ParsedRide[] = [];
  for (const row of rows.slice(1)) {
    const rawDate = cleanCell(row[dateIndex]);
    const rawPickupTime = cleanCell(row[pickupTimeIndex]);
    const rawDropoffTime = dropoffTimeIndex >= 0 ? cleanCell(row[dropoffTimeIndex]) : '';
    const rawPickup = cleanCell(row[pickupIndex]);
    const rawDropoff = cleanCell(row[dropoffIndex]);
    if (/[?？]/u.test(rawPickupTime) || /[?？]/u.test(rawPickup) || /[?？]/u.test(rawDate)) continue;
    const businessDate = parseDate(rawDate);
    const pickupMinute = parseMinute(rawPickupTime);
    const pickupZone = classifyZone(rawPickup);
    const dropoffZone = /[?？]/u.test(rawDropoff) ? null : classifyZone(rawDropoff);
    const fare = parseFare(row[fareIndex]);
    const dropoffMinute = /[?？]/u.test(rawDropoffTime) ? null : parseMinute(rawDropoffTime);
    if (!businessDate || pickupMinute === null || !pickupZone || fare === null) continue;
    rides.push({businessDate, pickupMinute, dropoffMinute, pickupZone, dropoffZone, fare});
  }
  return rides.sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.pickupMinute - b.pickupMinute);
}

function buildObservations(rides: ParsedRide[]): EfficiencyObservation[] {
  const observations: EfficiencyObservation[] = [];
  for (let index = 0; index < rides.length - 1; index += 1) {
    const ride = rides[index];
    const next = rides[index + 1];
    if (!ride || !next || ride.businessDate !== next.businessDate || !ride.dropoffZone) continue;
    const pickupInterval = next.pickupMinute - ride.pickupMinute;
    if (!Number.isFinite(pickupInterval) || pickupInterval <= 0 || pickupInterval > 180) continue;
    const sameZone = next.pickupZone === ride.dropoffZone;
    let actualIdle: number | null = null;
    if (
      sameZone &&
      ride.dropoffMinute !== null &&
      ride.dropoffMinute >= ride.pickupMinute &&
      ride.dropoffMinute <= next.pickupMinute
    ) {
      const idle = next.pickupMinute - ride.dropoffMinute;
      if (idle >= 0 && idle <= 120) actualIdle = idle;
    }
    observations.push({
      zone: ride.dropoffZone,
      group: dayGroup(next.businessDate),
      bin: timeBin(next.pickupMinute),
      pickupInterval,
      actualIdle,
      nextFare: next.fare,
      sameZone
    });
  }
  return observations;
}

function metricFor(observations: EfficiencyObservation[], source: EfficiencySource): MetricDraft {
  const sameZone = observations.filter((observation) => observation.sameZone);
  const actualIdle = sameZone
    .map((observation) => observation.actualIdle)
    .filter((value): value is number => value !== null);
  const intervals = sameZone.map((observation) => observation.pickupInterval).filter(Number.isFinite);
  const fares = sameZone.map((observation) => observation.nextFare).filter(Number.isFinite);
  const predictedIdleMinutes = actualIdle.length ? round1(median(actualIdle)) : null;
  const predictedCycleMinutes = intervals.length ? round1(median(intervals)) : null;
  const tripsPerHour = predictedCycleMinutes && predictedCycleMinutes > 0
    ? round2(60 / predictedCycleMinutes)
    : null;
  const expectedHourlyRevenue = tripsPerHour && fares.length
    ? round(average(fares) * tripsPerHour)
    : null;
  const noResponseRisk = observations.length
    ? round1((observations.filter((observation) => !observation.sameZone).length / observations.length) * 100)
    : null;
  const useActual = actualIdle.length >= 3;
  const rankingWaitMinutes = useActual ? predictedIdleMinutes : predictedCycleMinutes;
  const idleBasis: IdleBasis = useActual ? 'actual' : predictedCycleMinutes !== null ? 'pickup-interval' : actualIdle.length ? 'actual' : 'none';
  const sampleConfidence = confidence(sameZone.length);
  const efficiencyConfidence = clamp(
    sampleConfidence - (idleBasis === 'pickup-interval' ? 15 : 0) - (sameZone.length < 3 ? 10 : 0),
    0,
    100
  );
  return {
    predictedIdleMinutes,
    predictedCycleMinutes,
    tripsPerHour,
    expectedHourlyRevenue,
    noResponseRisk,
    idleBasis,
    efficiencySource: observations.length ? source : 'none',
    actualIdleSamples: actualIdle.length,
    sameZoneSamples: sameZone.length,
    opportunitySamples: observations.length,
    efficiencyConfidence,
    rankingWaitMinutes
  };
}

function imadaScore(metric: MetricDraft, globalHourlyRevenue: number, fallback: number, n: number): number {
  if (metric.rankingWaitMinutes === null || metric.tripsPerHour === null || metric.expectedHourlyRevenue === null) {
    return fallback;
  }
  const idle = scaleIdle(metric.rankingWaitMinutes);
  const turns = scaleTurns(metric.tripsPerHour);
  const hourlyRevenue = scaleHourlyRevenue(metric.expectedHourlyRevenue, globalHourlyRevenue);
  const weighted = (
    idle * FORMULA.idle +
    turns * FORMULA.turns +
    hourlyRevenue * FORMULA.hourlyRevenue
  ) / 100;
  const sparsePenalty = n < 3 ? 5 : n < 6 ? 2 : 0;
  const proxyPenalty = metric.idleBasis === 'pickup-interval' ? 3 : 0;
  const riskPenalty = metric.noResponseRisk === null ? 0 : Math.max(0, metric.noResponseRisk - 50) * 0.08;
  return clamp(round(weighted - sparsePenalty - proxyPenalty - riskPenalty), 20, 95);
}

function withoutRankingWait(metric: MetricDraft): ImadaEfficiencyMetric {
  const {rankingWaitMinutes: _rankingWaitMinutes, ...output} = metric;
  return output;
}

function scaleIdle(minutes: number): number {
  return clamp(140 - minutes * 4, 0, 100);
}

function scaleTurns(value: number): number {
  return clamp(((value - 0.5) / 2) * 100, 0, 100);
}

function scaleHourlyRevenue(value: number, globalAverage: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(globalAverage) || globalAverage <= 0) return 40;
  return clamp(50 + ((value / globalAverage) - 1) * 66.7, 0, 100);
}

function classifyZone(place: string): string | null {
  const value = normalize(place);
  if (!value || /^(不明|なし|未確認|-|―)$/u.test(value)) return null;
  for (const [zone, terms] of Object.entries(ZONE_TERMS)) {
    if (terms.some((term) => value.includes(normalize(term)))) return zone;
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
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value.trim());
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

function findHeader(header: string[], candidates: string[]): number {
  const normalized = candidates.map((candidate) => normalize(candidate));
  return header.findIndex((value) => normalized.includes(value));
}

function normalize(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

function cleanCell(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function emptySegments(): Record<DayGroup, Record<TimeBin, Record<string, ImadaSegmentMetric>>> {
  const createBins = (): Record<TimeBin, Record<string, ImadaSegmentMetric>> => ({
    '14-18': {},
    '18-20': {},
    '20-22': {},
    '22-24': {},
    '0-2': {},
    '2-5': {}
  });
  return {weekday: createBins(), weekend: createBins()};
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

function confidence(n: number): number {
  return clamp(round(100 * (1 - Math.exp(-n / 6))), 0, 100);
}

function round(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function round1(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
