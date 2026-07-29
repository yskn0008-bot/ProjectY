export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return '';
  }
}

export async function assertOk(response: Response, operation: string): Promise<void> {
  if (response.ok) return;
  const detail = await readErrorBody(response);
  throw new Error(`${operation} failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
}
