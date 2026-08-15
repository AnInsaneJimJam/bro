import type { TextProviderConfig } from '@bro/ai';

export function textProviderConfig(kind: 'default' | 'script' = 'default') {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey)
    return {
      provider: 'openrouter',
      apiKey: openRouterKey,
      model:
        (kind === 'script' ? process.env.OPENROUTER_SCRIPT_MODEL : undefined) ||
        process.env.OPENROUTER_MODEL ||
        'nvidia/nemotron-3-ultra-550b-a55b:free',
      siteUrl:
        process.env.OPENROUTER_SITE_URL || process.env.NEXT_PUBLIC_APP_URL,
      appName: process.env.OPENROUTER_APP_NAME || 'Bro',
    } satisfies TextProviderConfig;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey)
    return {
      provider: 'gemini',
      apiKey: geminiKey,
      model:
        (kind === 'script' ? process.env.GEMINI_SCRIPT_MODEL : undefined) ||
        process.env.GEMINI_TEXT_MODEL ||
        'gemini-flash-latest',
    } satisfies TextProviderConfig;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey)
    return {
      provider: 'openai',
      apiKey: openAiKey,
      model:
        (kind === 'script' ? process.env.OPENAI_SCRIPT_MODEL : undefined) ||
        process.env.OPENAI_TEXT_MODEL ||
        'gpt-5.6-luna',
    } satisfies TextProviderConfig;
  throw Object.assign(
    new Error(
      'Text AI is not configured. Add OPENROUTER_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY.'
    ),
    { status: 503 }
  );
}
