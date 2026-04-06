import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { BrowseScreen } from './screens/browse';
import { RecordScreen } from './screens/record';
import { PlaybackScreen } from './screens/playback';
import { SetupWizard } from './screens/setup/wizard';
import { RecordingsCacheImpl } from './cache/recordings-cache';
import { TranscriptCacheImpl } from './cache/transcript-cache';
import { AudioCacheImpl } from './cache/audio-cache';
import { openDb } from './cache/db';
import { MutationQueue } from './queue/mutation-queue';
import { getApiClient, resetApiClient } from './api/index';
import { loadFromStorage, hasBackend, getStoredBackendUrl } from './cache/settings-cache';
import { useOnline } from './hooks/use-online';
import { useRecordings } from './hooks/use-recordings';
import type { AppScreen } from './state/app-state';
import type { Recording, TextIndex } from './api/types';
import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB } from './cache/db';
import { arrayBufferToBase64 } from './utils/audio-utils';
import { WhisperClient } from './transcription/whisper-client';
import { getSettings } from './cache/settings-cache';

export function App() {
  const [screen, setScreen] = useState<AppScreen>({ name: 'browse' });
  const [ready, setReady] = useState(false);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [backendUpdateAvailable, setBackendUpdateAvailable] = useState(false);

  // Services
  const [db, setDb] = useState<IDBPDatabase<VoiceRecorderDB> | null>(null);
  const [recordingsCache, setRecordingsCache] = useState<RecordingsCacheImpl | null>(null);
  const [transcriptCache, setTranscriptCache] = useState<TranscriptCacheImpl | null>(null);
  const [audioCache, setAudioCache] = useState<AudioCacheImpl | null>(null);
  const [queue, setQueue] = useState<MutationQueue | null>(null);
  const [backendUrl, setBackendUrl] = useState<string | null>(null);

  const online = useOnline();

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      await loadFromStorage();

      const database = await openDb();
      const rc = new RecordingsCacheImpl(database);
      const tc = new TranscriptCacheImpl(database);
      const ac = new AudioCacheImpl(database);

      // Build executor for the queue
      const executor = async (op: import('./queue/operations').QueueOperation) => {
        const api = getApiClient();
        switch (op.type) {
          case 'upload': {
            const audio = await ac.get(`rec_${op.clientTimestamp}`);
            if (!audio) throw new Error('Audio not in cache');
            const b64 = arrayBufferToBase64(audio.data);
            const result = await api.uploadRecording({
              clientTimestamp: op.clientTimestamp,
              audioBase64: b64,
              mimeType: op.mimeType,
              duration: op.duration,
              location: op.location,
            });
            await rc.patch(result.recording.id, result.recording);
            break;
          }
          case 'transcribe': {
            if (op.mode === 'local') {
              const audio = await ac.get(op.recordingId);
              if (!audio) throw new Error('Audio not in cache for local transcription');
              const settings = await getSettings();
              const whisper = new WhisperClient();
              try {
                const transcript = await whisper.transcribe(audio.data, settings.onDeviceModel);
                await tc.set(op.recordingId, transcript);
                await rc.patch(op.recordingId, {
                  hasTranscript: true,
                  preview: transcript.text.substring(0, 200),
                  transcriptionSource: 'local',
                  transcriptionModel: transcript.model,
                });
              } finally {
                whisper.terminate();
              }
            } else {
              const result = await api.transcribe(op.recordingId);
              await tc.set(op.recordingId, result.transcript);
              await rc.patch(op.recordingId, {
                hasTranscript: true,
                preview: result.transcript.text.substring(0, 200),
                transcriptionSource: result.transcript.source,
                transcriptionModel: result.transcript.model,
              });
            }
            break;
          }
          case 'save-transcript': {
            await api.saveTranscript(op.recordingId, op.transcript);
            break;
          }
          case 'generate-title': {
            const result = await api.generateTitle(op.recordingId);
            if (result.title) await rc.patch(op.recordingId, { title: result.title });
            break;
          }
          case 'batch-generate-titles': {
            const result = await api.batchGenerateTitles(op.recordingIds);
            for (const { id, title } of result.titles) {
              if (title) await rc.patch(id, { title });
            }
            break;
          }
          case 'update-title': {
            await api.updateTitle(op.recordingId, op.title);
            break;
          }
          case 'delete': {
            await api.deleteRecording(op.recordingId);
            break;
          }
          case 'save-settings': {
            await api.saveSettings(op.settings);
            break;
          }
          case 'auto-upgrade-transcription': {
            const result = await api.transcribe(op.recordingId);
            await tc.set(op.recordingId, result.transcript);
            await rc.patch(op.recordingId, {
              hasTranscript: true,
              preview: result.transcript.text.substring(0, 200),
              transcriptionSource: 'openai',
              transcriptionModel: result.transcript.model,
            });
            break;
          }
        }
      };

      const q = new MutationQueue(database, executor);

      setDb(database);
      setRecordingsCache(rc);
      setTranscriptCache(tc);
      setAudioCache(ac);
      setQueue(q);

      if (hasBackend()) {
        const url = (await import('./cache/settings-cache')).getStoredBackendUrl();
        setBackendUrl(url);
      }

      await q.startup();
      setReady(true);
    };

    init().catch(console.error);

    // Listen for backend version event
    const onBackendUpdate = () => setBackendUpdateAvailable(true);
    globalThis.addEventListener('backend-update-available', onBackendUpdate);

    // PWA update detection
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setAppUpdateAvailable(true);
            }
          });
        });
      }).catch(() => null);
    }

    return () => {
      globalThis.removeEventListener('backend-update-available', onBackendUpdate);
    };
  }, []);

  // Process queue on reconnect
  useEffect(() => {
    if (online && queue) {
      queue.startup();
    }
  }, [online, queue]);

  const handleApplyUpdate = () => {
    navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  };

  const handleSetupComplete = () => {
    resetApiClient();
    setBackendUrl(getStoredBackendUrl());
    setScreen({ name: 'browse' });
  };

  if (!ready || !recordingsCache || !transcriptCache || !audioCache || !queue) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center', color: '#5f6368' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎙</div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const api = hasBackend() ? getApiClient() : null;

  return (
    <AppScreens
      screen={screen}
      onNavigate={setScreen}
      recordingsCache={recordingsCache}
      transcriptCache={transcriptCache}
      audioCache={audioCache}
      queue={queue}
      api={api}
      backendUrl={backendUrl}
      appUpdateAvailable={appUpdateAvailable}
      backendUpdateAvailable={backendUpdateAvailable}
      onApplyUpdate={handleApplyUpdate}
      onSetupComplete={handleSetupComplete}
    />
  );
}

interface AppScreensProps {
  screen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  recordingsCache: RecordingsCacheImpl;
  transcriptCache: TranscriptCacheImpl;
  audioCache: AudioCacheImpl;
  queue: MutationQueue;
  api: ReturnType<typeof getApiClient> | null;
  backendUrl: string | null;
  appUpdateAvailable: boolean;
  backendUpdateAvailable: boolean;
  onApplyUpdate: () => void;
  onSetupComplete: () => void;
}

function AppScreens({
  screen,
  onNavigate,
  recordingsCache,
  transcriptCache,
  audioCache,
  queue,
  api,
  backendUrl,
  appUpdateAvailable,
  backendUpdateAvailable,
  onApplyUpdate,
  onSetupComplete,
}: AppScreensProps) {
  const { recordings, textIndex, refresh, upsertRecording, removeRecording, patchRecording } =
    useRecordings(recordingsCache, transcriptCache, api);

  const handleRefresh = useCallback(async () => {
    await refresh();
    if (queue) await queue.startup();
  }, [refresh, queue]);

  if (screen.name === 'setup') {
    return (
      <SetupWizard
        onComplete={onSetupComplete}
        onSkip={() => onNavigate({ name: 'browse' })}
        onNavigate={onNavigate}
      />
    );
  }

  if (screen.name === 'record') {
    return (
      <RecordScreen
        recordingsCache={recordingsCache}
        audioCache={audioCache}
        queue={queue}
        onNavigate={onNavigate}
        onRecordingAdded={upsertRecording}
      />
    );
  }

  if (screen.name === 'playback') {
    return (
      <PlaybackScreen
        recordingId={screen.recordingId}
        seekTo={screen.seekTo}
        api={api}
        audioCache={audioCache}
        transcriptCache={transcriptCache}
        recordingsCache={recordingsCache}
        queue={queue}
        recordings={recordings}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <BrowseScreen
      recordings={recordings}
      textIndex={textIndex}
      api={api}
      queue={queue}
      recordingsCache={recordingsCache}
      transcriptCache={transcriptCache}
      pendingIds={new Set()}
      failedUploadIds={new Set()}
      failedTranscribeIds={new Set()}
      onNavigate={onNavigate}
      onRefresh={handleRefresh}
      backendUpdateAvailable={backendUpdateAvailable}
      appUpdateAvailable={appUpdateAvailable}
      onApplyUpdate={onApplyUpdate}
      backendUrl={backendUrl}
    />
  );
}
