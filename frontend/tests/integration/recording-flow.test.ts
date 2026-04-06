import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openDb } from '../../src/cache/db';
import { RecordingsCacheImpl } from '../../src/cache/recordings-cache';
import { AudioCacheImpl } from '../../src/cache/audio-cache';
import { MutationQueue } from '../../src/queue/mutation-queue';
import { onRecordingComplete } from '../../src/queue/operations';
import { makeFakeAudioBuffer } from '../mocks/audio';
import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB } from '../../src/cache/db';
import type { QueueOperation } from '../../src/queue/operations';

let db: IDBPDatabase<VoiceRecorderDB>;
let recordingsCache: RecordingsCacheImpl;
let audioCache: AudioCacheImpl;

beforeEach(async () => {
  db = await openDb();
  // Clear all stores
  for (const store of ['recordings', 'audio', 'queue'] as const) {
    const tx = db.transaction(store, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }
  recordingsCache = new RecordingsCacheImpl(db);
  audioCache = new AudioCacheImpl(db);
});

describe('Recording Flow Integration', () => {
  it('creates optimistic recording entry after completion', async () => {
    const ts = Date.now();
    const audio = makeFakeAudioBuffer(512);
    const executor = vi.fn().mockResolvedValue(undefined);
    const queue = new MutationQueue(db, executor);

    await onRecordingComplete(
      { clientTimestamp: ts, audioData: audio, mimeType: 'audio/mp4', duration: 10, location: null },
      { recordingsCache, audioCache, queue },
    );

    const recordings = await recordingsCache.getAll();
    expect(recordings).toHaveLength(1);
    expect(recordings[0].id).toBe(`rec_${ts}`);
    expect(recordings[0].hasTranscript).toBe(false);
  });

  it('saves audio to local cache before enqueueing upload', async () => {
    const ts = Date.now();
    const audio = makeFakeAudioBuffer(512);
    const enqueueOrder: string[] = [];

    const executor = vi.fn().mockImplementation(async (op: QueueOperation) => {
      enqueueOrder.push(op.type);
    });
    const queue = new MutationQueue(db, executor);
    const enqueueOriginal = queue.enqueue.bind(queue);
    const enqueueSpy = vi.spyOn(queue, 'enqueue').mockImplementation(async (op) => {
      // Verify audio is already cached when enqueue is called
      if (op.type === 'upload') {
        const cached = await audioCache.get(`rec_${ts}`);
        expect(cached).not.toBeNull();
      }
      return enqueueOriginal(op);
    });

    await onRecordingComplete(
      { clientTimestamp: ts, audioData: audio, mimeType: 'audio/mp4', duration: 10, location: null },
      { recordingsCache, audioCache, queue },
    );

    expect(enqueueSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'upload' }));
  });

  it('enqueues upload operation with correct payload', async () => {
    const ts = 1712345678901;
    const audio = makeFakeAudioBuffer(256);
    const executor = vi.fn().mockResolvedValue(undefined);
    const queue = new MutationQueue(db, executor);
    const enqueueSpy = vi.spyOn(queue, 'enqueue');

    await onRecordingComplete(
      {
        clientTimestamp: ts,
        audioData: audio,
        mimeType: 'audio/mp4',
        duration: 15,
        location: { lat: 37.7, lng: -122.4, label: 'SF' },
      },
      { recordingsCache, audioCache, queue },
    );

    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'upload',
        clientTimestamp: ts,
        mimeType: 'audio/mp4',
        duration: 15,
      }),
    );
  });

  it('enqueues a transcribe operation after recording completes', async () => {
    const ts = Date.now();
    const audio = makeFakeAudioBuffer(512);
    const executor = vi.fn().mockResolvedValue(undefined);
    const queue = new MutationQueue(db, executor);
    const enqueueSpy = vi.spyOn(queue, 'enqueue');

    await onRecordingComplete(
      { clientTimestamp: ts, audioData: audio, mimeType: 'audio/mp4', duration: 10, location: null },
      { recordingsCache, audioCache, queue },
    );

    const enqueuedTypes = enqueueSpy.mock.calls.map(([op]) => op.type);
    expect(enqueuedTypes).toContain('transcribe');
    const transcribeCall = enqueueSpy.mock.calls.find(([op]) => op.type === 'transcribe');
    expect(transcribeCall?.[0]).toMatchObject({ type: 'transcribe', recordingId: `rec_${ts}`, mode: 'local' });
  });

  it('optimistic entry shows location from recording', async () => {
    const ts = Date.now();
    const executor = vi.fn().mockResolvedValue(undefined);
    const queue = new MutationQueue(db, executor);

    await onRecordingComplete(
      {
        clientTimestamp: ts,
        audioData: makeFakeAudioBuffer(64),
        mimeType: 'audio/mp4',
        duration: 5,
        location: { lat: 40.7128, lng: -74.006, label: 'New York, NY, US' },
      },
      { recordingsCache, audioCache, queue },
    );

    const [rec] = await recordingsCache.getAll();
    expect(rec.location?.label).toBe('New York, NY, US');
  });
});
