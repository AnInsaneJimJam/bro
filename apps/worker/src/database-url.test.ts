import { describe, expect, it } from 'vitest';
import { pgBossConnectionString } from './database-url';

describe('pgBossConnectionString', () => {
  it('removes URL SSL settings when a verified custom CA is supplied', () => {
    expect(
      pgBossConnectionString(
        'postgresql://user:pass@pooler.example.com:5432/postgres?sslmode=verify-full&application_name=bro',
        true
      )
    ).toBe(
      'postgresql://user:pass@pooler.example.com:5432/postgres?application_name=bro'
    );
  });

  it('preserves the original URL when no custom CA is supplied', () => {
    const value = 'postgresql://localhost:5432/bro?sslmode=disable';
    expect(pgBossConnectionString(value, false)).toBe(value);
  });
});
