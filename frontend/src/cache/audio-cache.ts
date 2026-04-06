import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB } from './db';

export const MAX_CACHED_AUDIO = 10;

export interface AudioCache {
  get(id: string): Promise<{ data: ArrayBuffer; mimeType: string } | null>;
  set(id: string, data: ArrayBuffer, mimeType: string): Promise<void>;
  remove(id: string): Promise<void>;
  evictIfNeeded(): Promise<void>;
}

export class AudioCacheImpl implements AudioCache {
  constructor(private db: IDBPDatabase<VoiceRecorderDB>) {}

  async get(id: string): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
    const entry = await this.db.get('audio', id);
    if (!entry) return null;

    // Update accessedAt for LRU tracking
    await this.db.put('audio', { ...entry, accessedAt: Date.now() }, id);
    return { data: entry.data, mimeType: entry.mimeType };
  }

  async set(id: string, data: ArrayBuffer, mimeType: string): Promise<void> {
    await this.db.put('audio', { data, mimeType, accessedAt: Date.now() }, id);
  }

  async remove(id: string): Promise<void> {
    await this.db.delete('audio', id);
  }

  async evictIfNeeded(): Promise<void> {
    const count = await this.db.count('audio');
    if (count <= MAX_CACHED_AUDIO) return;

    // Get all entries with their keys, sorted by accessedAt ascending (oldest first)
    const tx = this.db.transaction('audio', 'readwrite');
    const entries: Array<{ key: string; accessedAt: number }> = [];

    let cursor = await tx.store.openCursor();
    while (cursor) {
      entries.push({ key: cursor.key as string, accessedAt: cursor.value.accessedAt });
      cursor = await cursor.continue();
    }

    entries.sort((a, b) => a.accessedAt - b.accessedAt);

    const toEvict = entries.slice(0, count - MAX_CACHED_AUDIO);
    for (const { key } of toEvict) {
      await tx.store.delete(key);
    }
    await tx.done;
  }
}
