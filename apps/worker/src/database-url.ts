export function pgBossConnectionString(databaseUrl: string, customCa: boolean) {
  if (!customCa) return databaseUrl;
  const parsed = new URL(databaseUrl);
  parsed.searchParams.delete('sslmode');
  parsed.searchParams.delete('uselibpqcompat');
  return parsed.toString();
}
