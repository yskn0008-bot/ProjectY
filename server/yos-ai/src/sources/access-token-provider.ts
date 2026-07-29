export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export interface GoogleAuthAccessClient {
  getAccessToken(): Promise<string | { token?: string | null } | null>;
}

export class GoogleAuthAccessTokenProvider implements AccessTokenProvider {
  constructor(private readonly client: GoogleAuthAccessClient) {}

  async getAccessToken(): Promise<string> {
    const result = await this.client.getAccessToken();
    const token = typeof result === 'string' ? result : result?.token;
    if (!token?.trim()) throw new Error('Google access token is unavailable');
    return token;
  }
}
