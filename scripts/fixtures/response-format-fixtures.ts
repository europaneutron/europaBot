export const RESPONSE_FORMAT_INTENTS = {
  test_fragmented: '10000000-0000-4000-8000-000000000001',
  test_simple_media: '10000000-0000-4000-8000-000000000002',
  test_simple_text: '10000000-0000-4000-8000-000000000003',
} as const;

export type ResponseFormatIntentName = keyof typeof RESPONSE_FORMAT_INTENTS;
