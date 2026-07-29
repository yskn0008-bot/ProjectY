import type {YosRuntimeConfig} from '../config.js';
import type {SourceRegistryEntry} from '../sources/google-source-provider.js';
import {validateBoundedRanges} from '../sources/a1-range.js';

export function createSourceRegistry(config: YosRuntimeConfig): SourceRegistryEntry[] {
  const entries: SourceRegistryEntry[] = [
    document('00_law', '00_律法', 'law', 1, config.sourceIds.law),
    document('02_yos_master', '02_YOS Master', 'master', 2, config.sourceIds.yosMaster),
    document('04_system_master', '04_System Master', 'master', 3, config.sourceIds.systemMaster),
    document('00_change_log', '00_Change Log', 'change-log', 4, config.sourceIds.changeLog),
    document('03_taxi_master', '03_Taxi Master', 'master', 5, config.sourceIds.taxiMaster),
    sheet(
      'project75_daily',
      'Project75 乗務日報',
      7,
      config.sourceIds.project75,
      ["'乗務日報'!A1:AE50"]
    ),
    sheet(
      'project75_trip_history',
      'Project75 乗車履歴',
      7,
      config.sourceIds.project75,
      ["'乗車履歴'!A1:AC200"]
    ),
    sheet(
      'project75_kpi',
      'Project75 KPI',
      7,
      config.sourceIds.project75,
      ["'KPI'!A1:Z100"]
    ),
    sheet(
      'project75_analysis',
      'Project75 分析',
      7,
      config.sourceIds.project75,
      ["'分析'!A1:Z100"]
    ),
    sheet(
      'project75_audit',
      'Project75 日報原本監査',
      7,
      config.sourceIds.project75,
      ["'日報原本監査'!A1:K50"]
    )
  ];

  for (const entry of entries) {
    if (entry.type === 'sheet') validateBoundedRanges(entry.ranges);
  }
  return entries;
}

function document(
  id: string,
  title: string,
  kind: 'law' | 'master' | 'change-log',
  priority: number,
  fileId: string
): SourceRegistryEntry {
  return {
    id,
    title,
    kind,
    priority,
    privacyLevel: 'L1',
    type: 'document',
    fileId
  };
}

function sheet(
  id: string,
  title: string,
  priority: number,
  spreadsheetId: string,
  ranges: string[]
): SourceRegistryEntry {
  return {
    id,
    title,
    kind: 'sheet',
    priority,
    privacyLevel: 'L2',
    type: 'sheet',
    spreadsheetId,
    ranges
  };
}
