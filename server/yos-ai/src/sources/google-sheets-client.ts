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

export interface AppendValuesResult {
  spreadsheetId: string;
  tableRange?: string;
  updates?: {
    updatedRange?: string;
    updatedRows?: number;
    updatedColumns?: number;
    updatedCells?: number;
  };
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

  async sheetTitles(spreadsheetId: string, accessToken: string): Promise<string[]> {
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`);
    url.searchParams.set('fields', 'sheets.properties.title');
    const response = await this.fetchImpl(url, {
      headers: {Authorization: `Bearer ${accessToken}`}
    });
    await assertOk(response, 'Google Sheets metadata read');
    const body = await response.json() as {sheets?: Array<{properties?: {title?: string}}>};
    return (body.sheets ?? []).map((sheet) => sheet.properties?.title ?? '').filter(Boolean);
  }

  async addSheet(spreadsheetId: string, title: string, accessToken: string): Promise<void> {
    const response = await this.fetchImpl(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({requests: [{addSheet: {properties: {title}}}]})
      }
    );
    if (response.status === 400) {
      const text = await response.text();
      if (text.includes('already exists')) return;
      throw new Error(`Google Sheets add sheet failed: ${response.status} ${text.slice(0, 300)}`);
    }
    await assertOk(response, 'Google Sheets add sheet');
  }

  async appendValues(
    spreadsheetId: string,
    range: string,
    values: unknown[][],
    accessToken: string
  ): Promise<AppendValuesResult> {
    validateBoundedRanges([range]);
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`);
    url.searchParams.set('valueInputOption', 'RAW');
    url.searchParams.set('insertDataOption', 'INSERT_ROWS');
    url.searchParams.set('includeValuesInResponse', 'false');
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({majorDimension: 'ROWS', values})
    });
    await assertOk(response, 'Google Sheets append');
    return await response.json() as AppendValuesResult;
  }
}
