import type { CreatorProfile, NicheVersion } from '@bro/core';
import {
  confirmNicheVersion,
  requireConfirmedNiche,
  scoreTrend,
} from '@bro/core';

type DemoScript = {
  id: string;
  title: string;
  duration: number;
  hook: string;
  beats: Array<{ label: string; spoken: string }>;
  cta: string;
  version: number;
  updatedAt: string;
};
const profile: CreatorProfile = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Creator',
  countryCode: 'IN',
  countryName: 'India',
  timeZone: 'Asia/Kolkata',
  onboardingComplete: true,
  autoPublish: { youtube: false, instagram: false },
};
let niches: NicheVersion[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    label: 'AI tools & productivity',
    subNiches: ['AI memory', 'workflow automation', 'creator tools'],
    rationale:
      'Recent owned posts repeatedly explain practical AI workflows and productivity tools.',
    confidence: 0.86,
    status: 'confirmed',
    insufficientData: false,
    evidence: [
      {
        platform: 'youtube',
        sourceId: 'yt-demo-1',
        excerpt: 'Three AI memory tricks that save me two hours daily',
        reason: 'Directly covers AI-assisted productivity.',
      },
      {
        platform: 'instagram',
        sourceId: 'ig-demo-1',
        excerpt: 'Turn voice notes into a second brain',
        reason: 'Repeated workflow-automation theme.',
      },
      {
        platform: 'reddit',
        sourceId: 'rd-demo-1',
        excerpt: 'My local-first AI note workflow',
        reason: 'Supports the AI memory sub-niche.',
      },
    ],
  },
];
let scripts: DemoScript[] = [];
export const demoStore = {
  getProfile: () => structuredClone(profile),
  updateProfile(
    input: Partial<
      Pick<
        CreatorProfile,
        'displayName' | 'countryCode' | 'countryName' | 'timeZone'
      >
    >
  ) {
    Object.assign(profile, input);
    return this.getProfile();
  },
  listNiches: () => structuredClone(niches),
  inferNiche() {
    return structuredClone(niches.at(-1)!);
  },
  confirmNiche(id: string, label: string, subNiches: string[]) {
    niches = confirmNicheVersion(niches, id, label, subNiches);
    return structuredClone(requireConfirmedNiche(niches));
  },
  opportunities(count = 5) {
    const niche = requireConfirmedNiche(niches);
    const rows = [
      [
        'AI agents that remember your work',
        1,
        0.8,
        0.8,
        1,
        1,
        "Show a memory workflow using a creator's real weekly tasks",
        'Your AI assistant forgets everything—and that is costing you hours.',
      ],
      [
        'Turn voice notes into a second brain',
        0.9,
        0.72,
        0.6,
        0.95,
        1,
        'Build the workflow in three fast steps',
        "Your messiest voice note can become tomorrow's best idea.",
      ],
      [
        'Why most AI productivity systems fail',
        0.82,
        0.6,
        0.7,
        0.95,
        0.9,
        'Use a contrarian teardown before the fix',
        'More AI tools may be making you less productive.',
      ],
      [
        'Private AI memory on your laptop',
        0.74,
        0.58,
        0.5,
        0.9,
        0.8,
        'Compare privacy and convenience without fearmongering',
        'Your second brain should not belong to someone else.',
      ],
      [
        'The one-inbox creator workflow',
        0.68,
        0.5,
        0.4,
        0.88,
        0.9,
        'Consolidate ideas from comments and voice notes',
        'Stop losing content ideas across five different apps.',
      ],
    ] as const;
    return rows.slice(0, count).map((r, i) => ({
      id: `20000000-0000-4000-8000-00000000000${i + 1}`,
      topic: r[0],
      score: scoreTrend({
        recency: r[1],
        velocity: r[2],
        crossSource: r[3],
        niche: r[4],
        country: r[5],
      }),
      country: profile.countryName,
      reason: `Strong fit for ${niche.label}.`,
      angle: r[6],
      hook: r[7],
      freshness: new Date(Date.now() - i * 3_600_000).toISOString(),
      evidence: [
        { platform: 'youtube', reference: `demo://youtube/${i + 1}` },
        { platform: 'reddit', reference: `demo://reddit/${i + 1}` },
      ],
      caveat: i > 2 ? 'Evidence is limited to two demo signals.' : null,
    }));
  },
  generateScript(topicId: string, duration: number, angle?: string) {
    const topic = this.opportunities(10).find((x) => x.id === topicId);
    if (!topic) throw new Error('Topic not found');
    const script: DemoScript = {
      id: crypto.randomUUID(),
      title: topic.topic,
      duration,
      hook: topic.hook,
      beats: [
        { label: 'Hook', spoken: topic.hook },
        {
          label: 'Problem',
          spoken:
            'Most creators keep adding tools, but every disconnected app creates another place for ideas to disappear.',
        },
        { label: 'Payoff', spoken: angle || topic.angle },
        { label: 'CTA', spoken: 'Save this and try it with your next video.' },
      ],
      cta: 'Save this and try it with your next video.',
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    scripts.unshift(script);
    return structuredClone(script);
  },
  generateCustomScript(topic: string, duration: number, angle?: string) {
    const title = topic.trim(),
      hook = `The idea that powers every message, app, and AI model started with ${title}.`,
      script: DemoScript = {
        id: crypto.randomUUID(),
        title,
        duration,
        hook,
        beats: [
          { label: 'Hook', spoken: hook },
          {
            label: 'Context',
            spoken: `${title} changed how we think about information and communication.`,
          },
          {
            label: 'Payoff',
            spoken:
              angle ||
              'The practical lesson is to remove noise, preserve the signal, and make the next idea easy to understand.',
          },
          { label: 'CTA', spoken: 'Save this for your next deep-dive short.' },
        ],
        cta: 'Save this for your next deep-dive short.',
        version: 1,
        updatedAt: new Date().toISOString(),
      };
    scripts.unshift(script);
    return structuredClone(script);
  },
  listScripts: () => structuredClone(scripts),
  updateScript(
    id: string,
    expectedVersion: number,
    patch: Partial<Pick<DemoScript, 'title' | 'hook' | 'beats' | 'cta'>>
  ) {
    const found = scripts.find((s) => s.id === id);
    if (!found) throw new Error('Script not found');
    if (found.version !== expectedVersion)
      throw Object.assign(
        new Error(
          'This script changed in another session. Refresh before saving.'
        ),
        { status: 409 }
      );
    Object.assign(found, patch, {
      version: found.version + 1,
      updatedAt: new Date().toISOString(),
    });
    return structuredClone(found);
  },
};
