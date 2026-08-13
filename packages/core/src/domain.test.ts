import { describe, expect, it } from 'vitest';
import {
  confirmNicheVersion,
  requireConfirmedNiche,
  type NicheVersion,
} from './domain';
const proposal: NicheVersion = {
  id: '10000000-0000-4000-8000-000000000001',
  label: 'AI',
  subNiches: [],
  rationale: 'Evidence',
  confidence: 0.8,
  status: 'proposed',
  insufficientData: false,
  evidence: [],
};
describe('niche lifecycle', () => {
  it('blocks discovery until confirmation', () =>
    expect(() => requireConfirmedNiche([proposal])).toThrow(/Confirm/));
  it('confirms an edited label', () =>
    expect(
      requireConfirmedNiche(
        confirmNicheVersion([proposal], proposal.id, 'AI productivity', [
          'automation',
        ])
      ).label
    ).toBe('AI productivity'));
});
