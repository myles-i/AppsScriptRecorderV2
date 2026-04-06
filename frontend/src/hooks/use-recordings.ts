import { useState, useEffect, useCallback } from 'preact/hooks';
import type { Recording, TextIndex } from '../api/types';
import type { RecordingsCacheImpl } from '../cache/recordings-cache';
import type { TranscriptCacheImpl } from '../cache/transcript-cache';
import type { ApiClient } from '../api/types';

export function useRecordings(
  recordingsCache: RecordingsCacheImpl,
  transcriptCache: TranscriptCacheImpl,
  api: ApiClient | null,
) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [textIndex, setTextIndex] = useState<TextIndex>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load from local cache on mount
  useEffect(() => {
    Promise.all([
      recordingsCache.getAll(),
      transcriptCache.getTextIndex(),
    ]).then(([cached, index]) => {
      setRecordings(cached);
      setTextIndex(index);
      setIsLoading(false);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const data = await api.getRecordings(true);
      await recordingsCache.replaceAll(data.recordings);
      setRecordings(await recordingsCache.getAll());

      if (data.textIndex) {
        await transcriptCache.setTextIndex(data.textIndex);
        setTextIndex(data.textIndex);
      }
    } catch {
      // Silently fail — show cached data
    }
  }, [api]);

  const upsertRecording = useCallback(
    async (recording: Recording) => {
      await recordingsCache.upsert(recording);
      setRecordings(await recordingsCache.getAll());
    },
    [],
  );

  const removeRecording = useCallback(
    async (id: string) => {
      await recordingsCache.remove(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    },
    [],
  );

  const patchRecording = useCallback(
    async (id: string, fields: Partial<Recording>) => {
      await recordingsCache.patch(id, fields);
      setRecordings(await recordingsCache.getAll());
    },
    [],
  );

  return {
    recordings,
    textIndex,
    isLoading,
    refresh,
    upsertRecording,
    removeRecording,
    patchRecording,
  };
}
