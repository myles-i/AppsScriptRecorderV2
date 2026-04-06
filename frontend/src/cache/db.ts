import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Recording, TranscriptSegment } from '../api/types';

export interface QueueEntry {
  id?: number;
  operation: import('../queue/operations').QueueOperation;
  status: 'pending' | 'processing' | 'failed';
  createdAt: number;
  lastAttemptAt: number | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
}

export interface VoiceRecorderDB extends DBSchema {
  recordings: {
    key: string;
    value: Recording;
    indexes: { 'by-date': string };
  };
  transcripts: {
    key: string;
    value: {
      text: string;
      segments: TranscriptSegment[];
      source: string;
      model: string;
    };
  };
  audio: {
    key: string;
    value: {
      data: ArrayBuffer;
      mimeType: string;
      accessedAt: number;
    };
  };
  queue: {
    key: number;
    value: QueueEntry;
    indexes: { 'by-status': string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'voicerecorder';
const DB_VERSION = 1;

let _db: IDBPDatabase<VoiceRecorderDB> | null = null;

export async function openDb(): Promise<IDBPDatabase<VoiceRecorderDB>> {
  if (_db) return _db;

  _db = await openDB<VoiceRecorderDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // recordings store
      if (!db.objectStoreNames.contains('recordings')) {
        const recStore = db.createObjectStore('recordings', { keyPath: 'id' });
        recStore.createIndex('by-date', 'date');
      }

      // transcripts store
      if (!db.objectStoreNames.contains('transcripts')) {
        db.createObjectStore('transcripts', { keyPath: undefined });
      }

      // audio store
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio', { keyPath: undefined });
      }

      // queue store
      if (!db.objectStoreNames.contains('queue')) {
        const qStore = db.createObjectStore('queue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        qStore.createIndex('by-status', 'status');
      }

      // meta store (for text index and other key-value data)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: undefined });
      }
    },
  });

  return _db;
}

/** Reset the cached DB instance (used in tests with fake-indexeddb). */
export function resetDb(): void {
  _db = null;
}
