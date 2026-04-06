import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { RecordingsCacheImpl } from '../cache/recordings-cache';
import type { TranscriptCacheImpl } from '../cache/transcript-cache';
import type { AudioCacheImpl } from '../cache/audio-cache';
import type { MutationQueue } from '../queue/mutation-queue';
import type { ApiClient } from '../api/types';

export interface AppServices {
  recordingsCache: RecordingsCacheImpl;
  transcriptCache: TranscriptCacheImpl;
  audioCache: AudioCacheImpl;
  queue: MutationQueue;
  api: ApiClient;
}

export const AppServicesContext = createContext<AppServices | null>(null);

export function useAppServices(): AppServices {
  const ctx = useContext(AppServicesContext);
  if (!ctx) throw new Error('AppServicesContext not provided');
  return ctx;
}

export type AppScreen =
  | { name: 'browse' }
  | { name: 'record' }
  | { name: 'playback'; recordingId: string; seekTo?: number }
  | { name: 'setup' };

export interface AppState {
  screen: AppScreen;
  hasBackend: boolean;
  isOnline: boolean;
  updateAvailable: boolean;
  backendUpdateAvailable: boolean;
  showSettings: boolean;
}
