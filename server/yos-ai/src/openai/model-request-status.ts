export type ModelRequestStatus = 'network' | '400' | '401' | '403' | '404' | '429' | '5xx' | 'other';

export function classifyModelRequestStatus(status: number): ModelRequestStatus {
  if (status === 400) return '400';
  if (status === 401) return '401';
  if (status === 403) return '403';
  if (status === 404) return '404';
  if (status === 429) return '429';
  if (status >= 500 && status <= 599) return '5xx';
  return 'other';
}
