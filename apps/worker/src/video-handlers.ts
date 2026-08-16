import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { and, asc, eq } from 'drizzle-orm';
import {
  GeminiCommandTranscriptionProvider,
  OpenAITranscriptionProvider,
  createGroqTranscriptionClient,
} from '@bro/ai';
import {
  captionCues,
  createDatabase,
  transcriptWords,
  videoProjects,
} from '@bro/db';
import {
  captionsToAss,
  detectedVideoMime,
  extractAudio,
  needsPublishNormalization,
  normalizeVideoArgs,
  probeVideo,
  renderArgs,
  runFfmpeg,
  segmentCaptions,
  validateUpload,
} from '@bro/video';
import type { JobHandlers } from './jobs';
export function createVideoHandlers(): Pick<
  JobHandlers,
  'validate-video' | 'transcribe-video' | 'render-video'
> {
  const url = required('NEXT_PUBLIC_SUPABASE_URL'),
    key = required('SUPABASE_SERVICE_ROLE_KEY'),
    storage = createClient(url, key, {
      auth: { persistSession: false },
    }).storage;
  return {
    'validate-video': async (data) =>
      withTemp(async (dir) => {
        const database = createDatabase();
        try {
          const [project] = await database.db
            .select()
            .from(videoProjects)
            .where(
              and(
                eq(videoProjects.id, data.projectId),
                eq(videoProjects.userId, data.userId)
              )
            )
            .limit(1);
          if (
            !project?.originalKey ||
            project.originalKey !== data.originalObjectKey
          )
            throw new Error(
              'Owned upload reference does not match the queued validation job'
            );
          const upload = (project.metadata || {}) as {
              filename?: string;
              mimeType?: string;
              size?: number;
            },
            original = await download(
              storage,
              process.env.SUPABASE_ORIGINALS_BUCKET || 'bro-originals',
              data.originalObjectKey
            ),
            inputPath = join(dir, 'original-upload');
          await writeFile(inputPath, original);
          const media = await probeVideo(inputPath),
            detectedMime = detectedVideoMime(media.formatName);
          validateUpload(
            {
              filename: upload.filename || 'uploaded-video',
              declaredMime: upload.mimeType || 'application/octet-stream',
              detectedMime,
              size: original.length,
              duration: media.duration,
            },
            {
              maxBytes: Number(process.env.MAX_UPLOAD_BYTES || 52428800),
              maxDuration: Number(process.env.MAX_VIDEO_DURATION_SECONDS || 60),
            }
          );
          const existingMetadata = (project.metadata || {}) as Record<
            string,
            unknown
          >;
          let publishMetadata: Record<string, unknown> = {};
          if (needsPublishNormalization(media)) {
            const normalizedPath = join(dir, 'publishable.mp4');
            await runFfmpeg(normalizeVideoArgs(inputPath, normalizedPath));
            const normalized = await readFile(normalizedPath),
              normalizedKey = `${data.userId}/${data.projectId}/publishable.mp4`,
              bucket = process.env.SUPABASE_RENDERS_BUCKET || 'bro-renders',
              uploaded = await storage
                .from(bucket)
                .upload(normalizedKey, normalized, {
                  contentType: 'video/mp4',
                  upsert: true,
                });
            if (uploaded.error) throw new Error(uploaded.error.message);
            const normalizedMedia = await probeVideo(normalizedPath);
            if (
              detectedVideoMime(normalizedMedia.formatName) !== 'video/mp4' ||
              normalizedMedia.videoCodec.toLowerCase() !== 'h264' ||
              (normalizedMedia.audioCodec &&
                normalizedMedia.audioCodec.toLowerCase() !== 'aac') ||
              (normalizedMedia.audioCodec &&
                normalizedMedia.audioSampleRate !== 48000)
            )
              throw new Error('FFmpeg did not produce a compatible MP4 video');
            publishMetadata = {
              publishObjectKey: normalizedKey,
              publishObjectBucket: bucket,
              publishSize: normalized.length,
              publishMimeType: 'video/mp4',
            };
          }
          await database.db
            .update(videoProjects)
            .set({
              metadata: {
                ...existingMetadata,
                ...upload,
                ...media,
                detectedMimeType: detectedMime,
                size: original.length,
                ...publishMetadata,
              },
              state: 'ready',
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(videoProjects.id, data.projectId),
                eq(videoProjects.userId, data.userId)
              )
            );
          return {
            size: original.length,
            duration: media.duration,
            detectedMimeType: detectedMime,
          };
        } finally {
          await database.close();
        }
      }),
    'transcribe-video': async (data) =>
      withTemp(async (dir) => {
        const lookup = createDatabase();
        const [owned] = await lookup.db
          .select({
            originalKey: videoProjects.originalKey,
            metadata: videoProjects.metadata,
          })
          .from(videoProjects)
          .where(
            and(
              eq(videoProjects.id, data.projectId),
              eq(videoProjects.userId, data.userId)
            )
          )
          .limit(1);
        await lookup.close();
        if (!owned?.originalKey || owned.originalKey !== data.originalObjectKey)
          throw new Error(
            'Owned upload reference does not match the queued transcription job'
          );
        const upload = (owned.metadata || {}) as {
          filename?: string;
          mimeType?: string;
        };
        const original = await download(
            storage,
            process.env.SUPABASE_ORIGINALS_BUCKET || 'bro-originals',
            data.originalObjectKey
          ),
          inputPath = join(dir, 'original-upload'),
          audioPath = join(dir, 'audio.mp3');
        await writeFile(inputPath, original);
        const metadata = await probeVideo(inputPath);
        validateUpload(
          {
            filename: upload.filename || 'uploaded-video',
            declaredMime: upload.mimeType || 'application/octet-stream',
            detectedMime: detectedVideoMime(metadata.formatName),
            size: original.length,
            duration: metadata.duration,
          },
          {
            maxBytes: Number(process.env.MAX_UPLOAD_BYTES || 52428800),
            maxDuration: Number(process.env.MAX_VIDEO_DURATION_SECONDS || 60),
          }
        );
        await extractAudio(inputPath, audioPath);
        const audio = await readFile(audioPath),
          audioKey = `${data.userId}/${data.projectId}/audio.mp3`;
        const uploaded = await storage
          .from(process.env.SUPABASE_AUDIO_BUCKET || 'bro-audio')
          .upload(audioKey, audio, { contentType: 'audio/mpeg', upsert: true });
        if (uploaded.error) throw new Error(uploaded.error.message);
        const transcript = await transcribeVideoAudio(audio, metadata.duration),
          cues = segmentCaptions(transcript.words);
        const database = createDatabase();
        try {
          const existingMetadata = (owned.metadata || {}) as Record<
            string,
            unknown
          >;
          await database.db.transaction(async (tx) => {
            await tx
              .delete(captionCues)
              .where(eq(captionCues.projectId, data.projectId));
            await tx
              .delete(transcriptWords)
              .where(eq(transcriptWords.projectId, data.projectId));
            if (transcript.words.length)
              await tx.insert(transcriptWords).values(
                transcript.words.map((word, position) => ({
                  projectId: data.projectId,
                  text: word.text,
                  start: word.start,
                  end: word.end,
                  confidence: word.confidence,
                  position,
                }))
              );
            if (cues.length)
              await tx.insert(captionCues).values(
                cues.map((cue, position) => ({
                  projectId: data.projectId,
                  text: cue.text,
                  start: cue.start,
                  end: cue.end,
                  position,
                  style: {
                    fontSize: 58,
                    textColor: '#ffffff',
                    outline: 4,
                    verticalPosition: 'bottom',
                  },
                }))
              );
            await tx
              .update(videoProjects)
              .set({
                metadata: {
                  ...existingMetadata,
                  ...metadata,
                  audioObjectKey: audioKey,
                  transcriptText: transcript.text,
                  transcriptionStatus: 'ready',
                  transcriptionProvider: transcript.provider,
                },
                // Captions are useful for metadata drafting, but they are not
                // required for publishing in this MVP. Keep the project
                // publish-ready after the optional transcript pass.
                state: 'ready',
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(videoProjects.id, data.projectId),
                  eq(videoProjects.userId, data.userId)
                )
              );
          });
        } finally {
          await database.close();
        }
        return { wordCount: transcript.words.length, cueCount: cues.length };
      }),
    'render-video': async (data) =>
      withTemp(async (dir) => {
        const database = createDatabase();
        try {
          const [project] = await database.db
            .select()
            .from(videoProjects)
            .where(
              and(
                eq(videoProjects.id, data.projectId),
                eq(videoProjects.userId, data.userId)
              )
            )
            .limit(1);
          if (!project?.originalKey)
            throw new Error('Owned video project or original media not found');
          const rows = await database.db
            .select()
            .from(captionCues)
            .where(eq(captionCues.projectId, data.projectId))
            .orderBy(asc(captionCues.position));
          if (!rows.length)
            throw new Error('Caption cues are required before rendering');
          const inputPath = join(dir, 'original.mp4'),
            assPath = join(dir, 'captions.ass'),
            outputPath = join(dir, 'rendered.mp4');
          await writeFile(
            inputPath,
            await download(
              storage,
              process.env.SUPABASE_ORIGINALS_BUCKET || 'bro-originals',
              project.originalKey
            )
          );
          let ass: string;
          try {
            ass = captionsToAss(
              rows.map((row) => ({
                text: row.text || '',
                start: row.start || 0,
                end: row.end || 0,
              })),
              rows[0]?.style as {
                fontSize?: number;
                outline?: number;
                verticalPosition?: 'top' | 'middle' | 'bottom';
              }
            );
          } catch {
            // Cue timing is read-only in the editor, so an overlap here is
            // leftover from a transcript pass generated before cue timing
            // was corrected at the source, not something the creator did.
            throw new Error(
              'These captions have an internal timing conflict from an earlier transcript pass. Use "Retry transcription & captions" on the Upload page to regenerate them, then try burning in captions again.'
            );
          }
          await writeFile(assPath, ass);
          await runFfmpeg(renderArgs(inputPath, assPath, outputPath));
          const rendered = await readFile(outputPath),
            renderedKey = `${data.userId}/${data.projectId}/rendered.mp4`,
            uploaded = await storage
              .from(process.env.SUPABASE_RENDERS_BUCKET || 'bro-renders')
              .upload(renderedKey, rendered, {
                contentType: 'video/mp4',
                upsert: true,
              });
          if (uploaded.error) throw new Error(uploaded.error.message);
          await database.db
            .update(videoProjects)
            .set({
              renderedKey,
              metadata: {
                ...((project.metadata || {}) as object),
                renderedSize: rendered.length,
                renderedMimeType: 'video/mp4',
              },
              state: 'ready',
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(videoProjects.id, data.projectId),
                eq(videoProjects.userId, data.userId)
              )
            );
          return { renderedKey, size: rendered.length };
        } finally {
          await database.close();
        }
      }),
  };
}

async function transcribeVideoAudio(audio: Buffer, duration: number) {
  // Copy into an ArrayBuffer-backed view so Node's Buffer<ArrayBufferLike>
  // type is accepted by the Web File constructor on every supported Node
  // version.
  const bytes = new Uint8Array(new ArrayBuffer(audio.byteLength));
  bytes.set(audio);
  const file = new File([bytes.buffer as ArrayBuffer], 'audio.mp3', {
    type: 'audio/mpeg',
  });
  if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      transcriber = new OpenAITranscriptionProvider(
        openai,
        process.env.OPENAI_COMMAND_TRANSCRIPTION_MODEL || 'gpt-transcribe',
        process.env.OPENAI_CAPTION_TRANSCRIPTION_MODEL || 'whisper-1'
      ),
      transcript = await transcriber.transcribeWithWordTimestamps(file);
    return { ...transcript, provider: 'openai' };
  }
  if (process.env.GROQ_API_KEY) {
    const transcriber = new OpenAITranscriptionProvider(
        createGroqTranscriptionClient(process.env.GROQ_API_KEY),
        process.env.GROQ_COMMAND_TRANSCRIPTION_MODEL ||
          'whisper-large-v3-turbo',
        process.env.GROQ_CAPTION_TRANSCRIPTION_MODEL || 'whisper-large-v3'
      ),
      transcript = await transcriber.transcribeWithWordTimestamps(file);
    return { ...transcript, provider: 'groq' };
  }
  if (process.env.GEMINI_API_KEY) {
    const transcriber = new GeminiCommandTranscriptionProvider(
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_TRANSCRIPTION_MODEL ||
          process.env.GEMINI_TEXT_MODEL ||
          'gemini-flash-latest'
      ),
      text = await transcriber.transcribeCommand(file);
    return {
      text,
      words: distributeTranscriptWords(text, duration),
      provider: 'gemini',
    };
  }
  throw new Error(
    'Video text drafting requires GROQ_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY on the worker.'
  );
}

function distributeTranscriptWords(text: string, duration: number) {
  const words = text
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!words.length) return [];
  const total = Math.max(1, duration || 1),
    step = total / words.length;
  return words.map((word, index) => ({
    text: word,
    start: index * step,
    end: Math.min(total, (index + 1) * step),
    confidence: undefined,
  }));
}
async function download(
  storage: ReturnType<typeof createClient>['storage'],
  bucket: string,
  key: string
) {
  const { data, error } = await storage.from(bucket).download(key);
  if (error) throw new Error(error.message);
  return Buffer.from(await data.arrayBuffer());
}
async function withTemp<T>(operation: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), 'bro-worker-'));
  try {
    return await operation(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
