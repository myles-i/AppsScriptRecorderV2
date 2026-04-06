import type { GeoLocation, Settings, Transcript } from '../api/types';

export type QueueOperation =
  | { type: 'upload'; clientTimestamp: number; mimeType: string; duration: number; location: GeoLocation | null }
  | { type: 'transcribe'; recordingId: string; mode: 'cloud' | 'local' }
  | { type: 'save-transcript'; recordingId: string; transcript: Transcript }
  | { type: 'generate-title'; recordingId: string }
  | { type: 'batch-generate-titles'; recordingIds: string[] }
  | { type: 'update-title'; recordingId: string; title: string }
  | { type: 'delete'; recordingId: string }
  | { type: 'save-settings'; settings: Settings }
  | { type: 'auto-upgrade-transcription'; recordingId: string };

/** Parameters passed to onRecordingComplete. */
export interface RecordingCompleteParams {
  clientTimestamp: number;
  audioData: ArrayBuffer;
  mimeType: string;
  duration: number;
  location: GeoLocation | null;
}

import type { RecordingsCacheImpl } from '../cache/recordings-cache';
import type { AudioCacheImpl } from '../cache/audio-cache';
import type { MutationQueue } from './mutation-queue';

export interface RecordingServices {
  recordingsCache: RecordingsCacheImpl;
  audioCache: AudioCacheImpl;
  queue: MutationQueue;
}

/**
 * Called when the user finishes recording.
 *
 * 1. Saves audio to local cache first (before any network call).
 * 2. Creates an optimistic recording entry.
 * 3. Enqueues the upload operation.
 */
export async function onRecordingComplete(
  params: RecordingCompleteParams,
  services: RecordingServices,
): Promise<void> {
  const { clientTimestamp, audioData, mimeType, duration, location } = params;
  const { recordingsCache, audioCache, queue } = services;

  const id = `rec_${clientTimestamp}`;

  // 1. Save audio to local cache FIRST
  await audioCache.set(id, audioData, mimeType);

  // 2. Create optimistic recording entry
  await recordingsCache.upsert({
    id,
    date: new Date(clientTimestamp).toISOString(),
    duration,
    mimeType,
    fileSize: audioData.byteLength,
    location,
    title: null,
    preview: null,
    transcriptionSource: null,
    transcriptionModel: null,
    hasTranscript: false,
  });

  // 3. Enqueue upload
  await queue.enqueue({ type: 'upload', clientTimestamp, mimeType, duration, location });
}
