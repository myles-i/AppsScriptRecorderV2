import { describe, it, expect, beforeEach } from 'vitest';
import { AudioCacheImpl, MAX_CACHED_AUDIO } from '../../../src/cache/audio-cache';
import { openDb } from '../../../src/cache/db';
import { makeFakeAudioBuffer } from '../../mocks/audio';
import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB } from '../../../src/cache/db';

let db: IDBPDatabase<VoiceRecorderDB>;
let cache: AudioCacheImpl;

beforeEach(async () => {
  db = await openDb();
  const tx = db.transaction('audio', 'readwrite');
  await tx.store.clear();
  await tx.done;
  cache = new AudioCacheImpl(db);
});

describe('AudioCache', () => {
  it('stores and retrieves an ArrayBuffer', async () => {
    const buf = makeFakeAudioBuffer(256);
    await cache.set('rec_1', buf, 'audio/mp4');
    const result = await cache.get('rec_1');
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe('audio/mp4');
    expect(result!.data.byteLength).toBe(256);
  });

  it('returns null for missing entry', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('remove deletes an entry', async () => {
    await cache.set('rec_1', makeFakeAudioBuffer(), 'audio/mp4');
    await cache.remove('rec_1');
    expect(await cache.get('rec_1')).toBeNull();
  });

  it('updates accessedAt on get (for LRU)', async () => {
    const buf = makeFakeAudioBuffer();
    await cache.set('rec_lru', buf, 'audio/mp4');

    const before = Date.now();
    await cache.get('rec_lru');
    const after = Date.now();

    // Read entry directly from db to check accessedAt
    const entry = await db.get('audio', 'rec_lru');
    expect(entry!.accessedAt).toBeGreaterThanOrEqual(before);
    expect(entry!.accessedAt).toBeLessThanOrEqual(after);
  });

  it(`evicts oldest entries when count exceeds ${MAX_CACHED_AUDIO}`, async () => {
    // Fill cache beyond the limit
    for (let i = 0; i < MAX_CACHED_AUDIO + 2; i++) {
      await cache.set(`rec_${i}`, makeFakeAudioBuffer(64), 'audio/mp4');
      await cache.evictIfNeeded();
      // Stagger accessedAt by incrementally reading
      if (i > 0) await cache.get(`rec_${i}`);
    }

    const count = await db.count('audio');
    expect(count).toBeLessThanOrEqual(MAX_CACHED_AUDIO);
  });

  it('evictIfNeeded does nothing when under the limit', async () => {
    await cache.set('rec_1', makeFakeAudioBuffer(), 'audio/mp4');
    await cache.evictIfNeeded();
    expect(await db.count('audio')).toBe(1);
  });
});
