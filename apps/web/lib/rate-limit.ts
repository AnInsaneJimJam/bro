const windows = new Map<string, { count: number; resetsAt: number }>();
export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const found = windows.get(key);
  if (!found || found.resetsAt <= now) {
    windows.set(key, { count: 1, resetsAt: now + windowMs });
    return;
  }
  if (found.count >= limit)
    throw Object.assign(new Error('Rate limit exceeded. Try again shortly.'), {
      status: 429,
    });
  found.count++;
}
