import { describe, expect, it } from 'vitest';
import { databaseUrlWithExternalSslOptions } from './client';

describe('databaseUrlWithExternalSslOptions', () => {
  it('removes URL SSL modes when a verified CA is configured separately', () => {
    expect(
      databaseUrlWithExternalSslOptions(
        'postgresql://user:pass@pooler.example.com:5432/postgres?sslmode=verify-full&uselibpqcompat=true&application_name=bro',
        true
      )
    ).toBe(
      'postgresql://user:pass@pooler.example.com:5432/postgres?application_name=bro'
    );
  });

  it('leaves the URL unchanged without external SSL options', () => {
    const url = 'postgresql://localhost:5432/bro?sslmode=disable';
    expect(databaseUrlWithExternalSslOptions(url, false)).toBe(url);
  });
});
