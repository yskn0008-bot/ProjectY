import type { DomainRoute } from './types.js';

export const CORE_SOURCE_IDS = [
  '00_law',
  '02_yos_master',
  '00_change_log'
] as const;

const DOMAIN_SOURCE_IDS: Record<DomainRoute['primary'], readonly string[]> = {
  yos: ['04_system_master'],
  'taxi-pre': ['03_taxi_master', 'project75_daily', 'project75_trip_history'],
  'taxi-live': ['03_taxi_master', 'project75_daily', 'project75_trip_history'],
  'taxi-post': ['03_taxi_master', 'project75_daily', 'project75_trip_history', 'project75_audit'],
  'taxi-research': ['03_taxi_master', 'project75_kpi', 'project75_analysis', 'project75_trip_history'],
  life: ['life_master'],
  money: ['money_master'],
  idea: ['idea_assets', 'mission_control'],
  system: ['04_system_master', 'projecty_code', 'mission_control'],
  translation: [],
  navigation: ['navigation_preferences'],
  external: []
};

export function requiredSourceIds(route: DomainRoute): string[] {
  const ids = [
    ...CORE_SOURCE_IDS,
    ...DOMAIN_SOURCE_IDS[route.primary],
    ...route.related.flatMap((domain) => DOMAIN_SOURCE_IDS[domain])
  ];

  return [...new Set(ids)];
}
