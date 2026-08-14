import type { TextProviderConfig } from '@bro/ai';

export function textProviderConfig(kind: 'default' | 'script' = 'default') {
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
    new Error('Text AI is not configured. Add GEMINI_API_KEY.'),
    { status: 503 }
  );
}
