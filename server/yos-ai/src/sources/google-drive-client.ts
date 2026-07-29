import { assertOk, type FetchLike } from '../http.js';

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

export class GoogleDriveClient {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async getMetadata(fileId: string, accessToken: string): Promise<DriveFileMetadata> {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set('fields', 'id,name,mimeType,modifiedTime');
    url.searchParams.set('supportsAllDrives', 'true');

    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    await assertOk(response, 'Google Drive metadata read');
    return await response.json() as DriveFileMetadata;
  }

  async exportText(fileId: string, accessToken: string): Promise<string> {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`);
    url.searchParams.set('mimeType', 'text/plain');

    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    await assertOk(response, 'Google Docs text export');
    return await response.text();
  }
}
