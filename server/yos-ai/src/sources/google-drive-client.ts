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

  async findByExactName(name: string, mimeType: string, accessToken: string): Promise<DriveFileMetadata | null> {
    const safeName = name.trim();
    const safeMimeType = mimeType.trim();
    if (!safeName || safeName.length > 160) throw new Error('Google Drive file name is invalid');
    if (!safeMimeType || safeMimeType.length > 120) throw new Error('Google Drive MIME type is invalid');
    const quote = (value: string) => value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `name = '${quote(safeName)}' and mimeType = '${quote(safeMimeType)}' and trashed = false`);
    url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime)');
    url.searchParams.set('pageSize', '2');
    url.searchParams.set('orderBy', 'modifiedTime desc');
    url.searchParams.set('spaces', 'drive');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');

    const response = await this.fetchImpl(url, {headers: {Authorization: `Bearer ${accessToken}`}});
    await assertOk(response, 'Google Drive exact-name lookup');
    const body = await response.json() as {files?: DriveFileMetadata[]};
    const files = (body.files ?? []).filter((file) => file.name === safeName && file.mimeType === safeMimeType);
    if (files.length > 1) throw new Error('Google Drive exact-name lookup is ambiguous');
    return files[0] ?? null;
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
