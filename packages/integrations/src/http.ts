import { ProviderUnavailableError } from './index';
export type HttpClient = (url: string, init?: RequestInit) => Promise<Response>;
export async function providerJson<T>(
  provider: 'youtube' | 'instagram' | 'reddit',
  http: HttpClient,
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await http(url, init);
  if (!response.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      detail = await response.text();
    }
    const retryable = response.status === 429 || response.status >= 500;
    throw new ProviderUnavailableError(
      provider,
      `HTTP_${response.status}`,
      `${provider} request failed (${response.status}): ${detail.slice(0, 400)}`,
      retryable
    );
  }
  return response.json() as Promise<T>;
}
