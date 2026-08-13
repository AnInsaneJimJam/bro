const commandAudioTypes = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);

export function validateCommandAudio(input: { type: string; size: number }) {
  const mimeType = input.type.toLowerCase().split(';', 1)[0]?.trim();
  if (!mimeType || !commandAudioTypes.has(mimeType))
    throw Object.assign(new Error('Unsupported audio format'), { status: 415 });
  if (input.size <= 0 || input.size > 25 * 1024 * 1024)
    throw Object.assign(
      new Error('Audio command must be between 1 byte and 25 MB'),
      { status: 413 }
    );
  return mimeType;
}
