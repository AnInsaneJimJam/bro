import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
export * from './scheduling';
export * from './domain';
export * from './idempotency';
export * from './publishing';
export * from './comments';
export * from './sync';
export const providers = z.enum(['youtube', 'instagram', 'reddit']);
export type Provider = z.infer<typeof providers>;
export const publishStates = z.enum([
  'draft',
  'awaiting_confirmation',
  'scheduled',
  'processing',
  'uploading',
  'published',
  'cancelled',
  'partially_published',
  'failed_retryable',
  'failed_permanent',
]);
export type PublishState = z.infer<typeof publishStates>;
const transitions: Record<PublishState, PublishState[]> = {
  draft: ['awaiting_confirmation', 'scheduled', 'processing', 'cancelled'],
  awaiting_confirmation: ['scheduled', 'processing', 'cancelled'],
  scheduled: ['processing', 'cancelled'],
  processing: ['uploading', 'failed_retryable', 'failed_permanent'],
  uploading: [
    'published',
    'partially_published',
    'failed_retryable',
    'failed_permanent',
  ],
  published: [],
  cancelled: [],
  partially_published: ['processing'],
  failed_retryable: ['processing', 'cancelled'],
  failed_permanent: [],
};
export function assertPublishTransition(from: PublishState, to: PublishState) {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid publish transition: ${from} -> ${to}`);
}
export type EncryptedSecret = {
  version: number;
  iv: string;
  tag: string;
  ciphertext: string;
};
export function encryptSecret(
  value: string,
  key: Buffer,
  version = 1
): EncryptedSecret {
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return {
    version,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}
export function decryptSecret(value: EncryptedSecret, key: Buffer) {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(value.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
export function redactSecrets<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (k, v) =>
      /token|secret|authorization|api.?key/i.test(k) ? '[REDACTED]' : v
    )
  );
}
export const trendScoreInput = z.object({
  recency: z.number().min(0).max(1),
  velocity: z.number().min(0).max(1),
  crossSource: z.number().min(0).max(1),
  niche: z.number().min(0).max(1),
  country: z.number().min(0).max(1),
});
export function scoreTrend(input: z.infer<typeof trendScoreInput>) {
  return Math.round(
    100 *
      (input.recency * 0.25 +
        input.velocity * 0.2 +
        input.crossSource * 0.15 +
        input.niche * 0.3 +
        input.country * 0.1)
  );
}
