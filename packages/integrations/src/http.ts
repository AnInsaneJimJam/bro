import { ProviderUnavailableError } from './index';
export type HttpClient = (url: string, init?: RequestInit) => Promise<Response>;
export async function providerJson<T>(
  provider: 'youtube' | 'instagram' | 'reddit',
  http: HttpClient,
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await http(url, init);
  if (!response.ok) throw await providerError(provider, response);
  return response.json() as Promise<T>;
}

export async function providerError(
  provider: 'youtube' | 'instagram' | 'reddit',
  response: Response
) {
  const raw = await response.text().catch(() => ''),
    payload = parsePayload(raw),
    reason = providerReason(payload),
    quota =
      response.status === 429 || /quota|rate.?limit|too.?many/i.test(reason),
    auth = response.status === 401 || /oauth|token|auth/i.test(reason),
    retryable =
      response.status === 429 || response.status >= 500 || (quota && !auth),
    code = auth
      ? 'PROVIDER_AUTH_EXPIRED'
      : quota
        ? response.status === 429
          ? 'PROVIDER_RATE_LIMITED'
          : 'PROVIDER_QUOTA_EXCEEDED'
        : `HTTP_${response.status}`,
    retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
  const message = auth
    ? `${provider} authorization is no longer valid. Reconnect the account.`
    : quota
      ? `${provider} quota or rate limit was reached. Try again after the provider allows more requests.`
      : retryable
        ? `${provider} is temporarily unavailable (${response.status}). Try again later.`
        : `${provider} rejected the request (${response.status}). Check permissions and media requirements.`;
  return new ProviderUnavailableError(
    provider,
    code,
    message,
    retryable,
    retryAfterMs
  );
}

function parsePayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function providerReason(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as Record<string, unknown>,
    error =
      root.error && typeof root.error === 'object'
        ? (root.error as Record<string, unknown>)
        : root,
    errors = Array.isArray(error.errors) ? error.errors : [],
    first =
      errors[0] && typeof errors[0] === 'object'
        ? (errors[0] as Record<string, unknown>)
        : undefined;
  return [first?.reason, error.type, error.code, root.message]
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ');
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}
