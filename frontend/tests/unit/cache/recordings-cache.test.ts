import { describe, it, expect, beforeEach } from 'vitest';
import { RecordingsCacheImpl } from '../../../src/cache/recordings-cache';
import { openDb } from '../../../src/cache/db';
import { MOCK_RECORDINGS } from '../../mocks/recordings';
import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB } from '../../../src/cache/db';

let db: IDBPDatabase<VoiceRecorderDB>;
let cache: RecordingsCacheImpl;

beforeEach(async () => {
  db = await openDb();
  // Clear the store between tests
  const tx = db.transaction('recordings', 'readwrite');
  await tx.store.clear();
  await tx.done;
  cache = new RecordingsCacheImpl(db);
});

describe('RecordingsCache', () => {
  it('upsert stores a recording and getAll retrieves it', async () => {
    await cache.upsert(MOCK_RECORDINGS[0]);
    const all = await cache.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(MOCK_RECORDINGS[0].id);
  });

  it('upsert overwrites an existing recording with the same id', async () => {
    await cache.upsert(MOCK_RECORDINGS[0]);
    await cache.upsert({ ...MOCK_RECORDINGS[0], title: 'Updated Title' });
    const all = await cache.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Updated Title');
  });

  it('remove deletes a recording by id', async () => {
    await cache.upsert(MOCK_RECORDINGS[0]);
    await cache.remove(MOCK_RECORDINGS[0].id);
    const all = await cache.getAll();
    expect(all).toHaveLength(0);
  });

  it('remove is a no-op if id does not exist', async () => {
    await expect(cache.remove('nonexistent')).resolves.not.toThrow();
  });

  it('patch updates individual fields without overwriting others', async () => {
    await cache.upsert(MOCK_RECORDINGS[0]);
    await cache.patch(MOCK_RECORDINGS[0].id, { title: 'Patched Title', hasTranscript: true });
    const all = await cache.getAll();
    expect(all[0].title).toBe('Patched Title');
    expect(all[0].hasTranscript).toBe(true);
    // Other fields unchanged
    expect(all[0].duration).toBe(MOCK_RECORDINGS[0].duration);
    expect(all[0].location?.label).toBe(MOCK_RECORDINGS[0].location?.label);
  });

  it('patch on non-existent id is a no-op', async () => {
    await expect(cache.patch('ghost', { title: 'X' })).resolves.not.toThrow();
  });

  it('replaceAll clears existing entries and writes new ones', async () => {
    await cache.upsert(MOCK_RECORDINGS[0]);
    await cache.replaceAll([MOCK_RECORDINGS[1], MOCK_RECORDINGS[2]]);
    const all = await cache.getAll();
    expect(all).toHaveLength(2);
    const ids = all.map((r) => r.id);
    expect(ids).not.toContain(MOCK_RECORDINGS[0].id);
    expect(ids).toContain(MOCK_RECORDINGS[1].id);
    expect(ids).toContain(MOCK_RECORDINGS[2].id);
  });

  it('getAll returns recordings sorted by date descending', async () => {
    for (const r of MOCK_RECORDINGS) await cache.upsert(r);
    const all = await cache.getAll();
    expect(all[0].date >= all[1].date).toBe(true);
  });
});
