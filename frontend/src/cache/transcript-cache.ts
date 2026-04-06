import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB } from './db';
import type { Transcript, TextIndex } from '../api/types';

const TEXT_INDEX_KEY = '__text_index__';

export interface TranscriptCache {
  get(id: string): Promise<Transcript | null>;
  set(id: string, transcript: Transcript): Promise<void>;
  remove(id: string): Promise<void>;
  getTextIndex(): Promise<TextIndex>;
  setTextIndex(index: TextIndex): Promise<void>;
}

export class TranscriptCacheImpl implements TranscriptCache {
  constructor(private db: IDBPDatabase<VoiceRecorderDB>) {}

  async get(id: string): Promise<Transcript | null> {
    const entry = await this.db.get('transcripts', id);
    if (!entry) return null;
    return {
      text: entry.text,
      segments: entry.segments,
      source: entry.source as Transcript['source'],
      model: entry.model,
    };
  }

  async set(id: string, transcript: Transcript): Promise<void> {
    await this.db.put('transcripts', {
      text: transcript.text,
      segments: transcript.segments,
      source: transcript.source,
      model: transcript.model,
    }, id);
  }

  async remove(id: string): Promise<void> {
    await this.db.delete('transcripts', id);
  }

  async getTextIndex(): Promise<TextIndex> {
    const stored = await this.db.get('meta', TEXT_INDEX_KEY) as TextIndex | undefined;
    return stored ?? {};
  }

  async setTextIndex(index: TextIndex): Promise<void> {
    await this.db.put('meta', index, TEXT_INDEX_KEY);
  }
}
