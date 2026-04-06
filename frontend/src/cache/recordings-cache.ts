import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB } from './db';
import type { Recording } from '../api/types';

export interface RecordingsCache {
  getAll(): Promise<Recording[]>;
  replaceAll(recordings: Recording[]): Promise<void>;
  upsert(recording: Recording): Promise<void>;
  remove(id: string): Promise<void>;
  patch(id: string, fields: Partial<Recording>): Promise<void>;
}

export class RecordingsCacheImpl implements RecordingsCache {
  constructor(private db: IDBPDatabase<VoiceRecorderDB>) {}

  async getAll(): Promise<Recording[]> {
    const all = await this.db.getAll('recordings');
    // Sort by date descending
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  async replaceAll(recordings: Recording[]): Promise<void> {
    const tx = this.db.transaction('recordings', 'readwrite');
    await tx.store.clear();
    for (const r of recordings) {
      await tx.store.put(r);
    }
    await tx.done;
  }

  async upsert(recording: Recording): Promise<void> {
    await this.db.put('recordings', recording);
  }

  async remove(id: string): Promise<void> {
    await this.db.delete('recordings', id);
  }

  async patch(id: string, fields: Partial<Recording>): Promise<void> {
    const existing = await this.db.get('recordings', id);
    if (!existing) return;
    await this.db.put('recordings', { ...existing, ...fields });
  }
}
