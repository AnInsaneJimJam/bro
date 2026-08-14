const commandAudioTypes = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
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

/** Convert a decoded browser AudioBuffer into a PCM WAV file that Gemini
 * accepts for short command transcription. This keeps the microphone path
 * provider-neutral when MediaRecorder chooses WebM/Opus in Chromium. */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number
): ArrayBuffer {
  if (!channels.length || !channels[0]?.length)
    throw new Error('Audio buffer is empty');
  const channelCount = Math.min(2, channels.length),
    frameCount = channels[0]!.length,
    bytesPerSample = 2,
    dataSize = frameCount * channelCount * bytesPerSample,
    buffer = new ArrayBuffer(44 + dataSize),
    view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame++)
    for (let channel = 0; channel < channelCount; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel]![frame] || 0));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += bytesPerSample;
    }
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++)
    view.setUint8(offset + i, value.charCodeAt(i));
}
