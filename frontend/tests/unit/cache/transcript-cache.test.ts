import { describe, it, expect, beforeEach } from 'vitest';
import { TranscriptCacheImpl } from '../../../src/cache/transcript-cache';
import { openDb } from '../../../src/cache/db';
import { MOCK_TRANSCRIPTS, MOCK_TEXT_INDEX } from '../../mocks/recordings';
import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB } from '../../../src/cache/db';

let db: IDBPDatabase<VoiceRecorderDB>;
let cache: TranscriptCacheImpl;

beforeEach(async () => {
  db = await openDb();
  // Clear both transcripts and meta (which holds the text index)
  const tx1 = db.transaction('transcripts', 'readwrite');
  await tx1.store.clear();
  await tx1.done;
  const tx2 = db.transaction('meta', 'readwrite');
  await tx2.store.clear();
  await tx2.done;
  cache = new TranscriptCacheImpl(db);
});

describe('TranscriptCache', () => {
  it('set and get round-trips a transcript', async () => {
    const t = MOCK_TRANSCRIPTS['rec_1712345678901'];
    await cache.set('rec_1712345678901', t);
    const result = await cache.get('rec_1712345678901');
    expect(result).not.toBeNull();
    expect(result!.text).toBe(t.text);
    expect(result!.segments).toHaveLength(t.segments.length);
  });

  it('get returns null for missing entry', async () => {
    expect(await cache.get('ghost')).toBeNull();
  });

  it('remove deletes a transcript', async () => {
    await cache.set('rec_1', MOCK_TRANSCRIPTS['rec_1712345678901']);
    await cache.remove('rec_1');
    expect(await cache.get('rec_1')).toBeNull();
  });

  it('setTextIndex and getTextIndex round-trips the full index', async () => {
    await cache.setTextIndex(MOCK_TEXT_INDEX);
    const result = await cache.getTextIndex();
    expect(result).toEqual(MOCK_TEXT_INDEX);
  });

  it('getTextIndex returns empty object when not set', async () => {
    const result = await cache.getTextIndex();
    expect(result).toEqual({});
  });
});
