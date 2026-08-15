import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';

/**
 * Gemini's legacy responseSchema/function parameters use its OpenAPI Schema
 * protobuf, which does not accept JSON Schema's additionalProperties field.
 * Zod remains the source of truth for validating the model response locally.
 */
export function zodToGeminiSchema(schema: z.ZodTypeAny) {
  return stripUnsupportedFields(
    zodToJsonSchema(schema, {
      target: 'openApi3',
      $refStrategy: 'none',
    })
  ) as Record<string, unknown>;
}

function stripUnsupportedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsupportedFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'additionalProperties')
      .map(([key, child]) => [key, stripUnsupportedFields(child)])
  );
}
