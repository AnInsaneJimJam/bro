import { z } from 'zod';

export const creatorProfileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(80),
  countryCode: z.string().length(2),
  countryName: z.string().min(2),
  timeZone: z.string().min(3),
  onboardingComplete: z.boolean(),
  autoPublish: z.object({ youtube: z.boolean(), instagram: z.boolean() }),
});
export type CreatorProfile = z.infer<typeof creatorProfileSchema>;

export const nicheVersionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(2),
  subNiches: z.array(z.string()).max(3),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
  status: z.enum(['proposed', 'confirmed', 'superseded']),
  insufficientData: z.boolean(),
  evidence: z.array(
    z.object({
      platform: z.enum(['youtube', 'instagram', 'reddit']),
      sourceId: z.string(),
      excerpt: z.string(),
      reason: z.string(),
    })
  ),
});
export type NicheVersion = z.infer<typeof nicheVersionSchema>;

export function confirmNicheVersion(
  versions: NicheVersion[],
  id: string,
  label: string,
  subNiches: string[]
) {
  const selected = versions.find((version) => version.id === id);
  if (!selected) throw new Error('Niche proposal not found');
  return versions.map((version) =>
    version.id === id
      ? { ...version, label, subNiches, status: 'confirmed' as const }
      : version.status === 'confirmed'
        ? { ...version, status: 'superseded' as const }
        : version
  );
}

export function requireConfirmedNiche(versions: NicheVersion[]) {
  const active = versions.find((version) => version.status === 'confirmed');
  if (!active)
    throw Object.assign(
      new Error(
        'Confirm or edit your niche before discovering topic opportunities.'
      ),
      { code: 'NICHE_CONFIRMATION_REQUIRED' }
    );
  return active;
}
