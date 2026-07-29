import { assertOk, type FetchLike } from '../http.js';
import { validateBoundedRanges } from './a1-range.js';

export interface GoogleValueRange {
  range: string;
  majorDimension?: 'ROWS' | 'COLUMNS';
  values?: unknown[][];
}

export interface BatchGetResult {
  spreadsheetId: string;
  valueRanges: GoogleValueRange[];
}

export class GoogleSheetsClient {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async batchGet(
    spreadsheetId: string,
    ranges: string[],
    accessToken: string
  ): Promise<BatchGetResult> {
    validateBoundedRanges(ranges);

    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`);
    for (const range of ranges) url.searchParams.append('ranges', range);
    url.searchParams.set('majorDimension', 'ROWS');
    url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');

    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    await assertOk(response, 'Google Sheets batch read');
    return await response.json() as BatchGetResult;
  }
}
