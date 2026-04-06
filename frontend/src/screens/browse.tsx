import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import type { Recording, TextIndex, ApiClient } from '../api/types';
import type { RecordingsCacheImpl } from '../cache/recordings-cache';
import type { TranscriptCacheImpl } from '../cache/transcript-cache';
import type { MutationQueue } from '../queue/mutation-queue';
import { SearchBar } from '../components/search-bar';
import { RecordingCard } from '../components/recording-card';
import { Banner } from '../components/banner';
import { SettingsModal } from '../components/settings-modal';
import { useSearch, findMatchingSegmentTime } from '../hooks/use-search';
import { useOnline } from '../hooks/use-online';
import type { AppScreen } from '../state/app-state';
import { hasBackend } from '../cache/settings-cache';

interface BrowseScreenProps {
  recordings: Recording[];
  textIndex: TextIndex;
  api: ApiClient | null;
  queue: MutationQueue | null;
  recordingsCache: RecordingsCacheImpl;
  transcriptCache: TranscriptCacheImpl;
  pendingIds: Set<string>;
  failedUploadIds: Set<string>;
  failedTranscribeIds: Set<string>;
  onNavigate: (screen: AppScreen) => void;
  onRefresh: () => Promise<void>;
  backendUpdateAvailable: boolean;
  appUpdateAvailable: boolean;
  onApplyUpdate: () => void;
  backendUrl: string | null;
}

export function BrowseScreen({
  recordings,
  textIndex,
  api,
  queue,
  recordingsCache,
  transcriptCache,
  pendingIds,
  failedUploadIds,
  failedTranscribeIds,
  onNavigate,
  onRefresh,
  backendUpdateAvailable,
  appUpdateAvailable,
  onApplyUpdate,
  backendUrl,
}: BrowseScreenProps) {
  const online = useOnline();
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { query, setQuery, results } = useSearch(recordings, textIndex);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, onRefresh]);

  const handleCardClick = (recording: Recording, searchQuery: string) => {
    let seekTo: number | undefined;
    if (searchQuery.trim()) {
      const entry = textIndex[recording.id];
      if (entry) {
        seekTo = findMatchingSegmentTime(entry.segments, searchQuery);
      }
    }
    onNavigate({ name: 'playback', recordingId: recording.id, seekTo });
  };

  const handleDisconnect = () => {
    onNavigate({ name: 'setup' });
  };

  const handleRebuildIndex = async () => {
    if (!api) return;
    await api.rebuildIndex();
    await onRefresh();
    showToast('Index rebuilt successfully');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8f9fa' }}>
      {/* Header */}
      <div
        style={{
          background: '#fff',
          padding: '16px 16px 8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h1 style={{ flex: 1, margin: 0, fontSize: 22, color: '#202124' }}>Voice Recorder</h1>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 4 }}
          >
            ⚙️
          </button>
        </div>
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {/* Banners */}
      <div style={{ padding: '4px 16px 0' }}>
        {appUpdateAvailable && (
          <Banner
            type="info"
            message="App update available."
            action={{ label: 'Reload', onClick: onApplyUpdate }}
          />
        )}
        {backendUpdateAvailable && (
          <Banner
            type="warning"
            message="Apps Script update available."
            action={{ label: 'Update now', onClick: () => onNavigate({ name: 'setup' }) }}
          />
        )}
        {!online && (
          <Banner
            type="info"
            message="Offline — recordings will upload when reconnected."
          />
        )}
        {!hasBackend() && (
          <Banner
            type="warning"
            message="No Drive sync — recordings may be lost if cache clears."
            action={{ label: 'Set up', onClick: () => onNavigate({ name: 'setup' }) }}
          />
        )}
      </div>

      {/* Recordings list */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 80px' }}
        onScroll={(e) => {
          // Pull-to-refresh: check if scrolled to top
          const target = e.target as HTMLElement;
          if (target.scrollTop < -40 && !refreshing) {
            handleRefresh();
          }
        }}
      >
        {results.length === 0 && query.trim() ? (
          <div style={{ textAlign: 'center', color: '#5f6368', padding: '48px 0', fontSize: 16 }}>
            No recordings match your search
          </div>
        ) : results.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#5f6368', padding: '48px 0', fontSize: 16 }}>
            No recordings yet. Tap the mic button to start recording.
          </div>
        ) : (
          results.map(({ recording, matches }) => {
            const transcriptSnippets = matches
              .filter((m) => m.field === 'transcript-context')
              .map((m) => m.text);

            return (
              <RecordingCard
                key={recording.id}
                recording={recording}
                isUploading={pendingIds.has(recording.id)}
                uploadFailed={failedUploadIds.has(recording.id)}
                transcribeFailed={failedTranscribeIds.has(recording.id)}
                searchQuery={query}
                searchSnippets={transcriptSnippets}
                onClick={() => handleCardClick(recording, query)}
              />
            );
          })
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => onNavigate({ name: 'record' })}
        aria-label="Start recording"
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: '#ea4335',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(234,67,53,0.4)',
          fontSize: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
          color: '#fff',
          transition: 'transform 0.15s',
        }}
      >
        🎙
      </button>

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          api={api}
          onClose={() => setShowSettings(false)}
          onDisconnect={handleDisconnect}
          onRebuildIndex={handleRebuildIndex}
          backendUrl={backendUrl}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(32,33,36,0.9)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 24,
            fontSize: 14,
            zIndex: 50,
            whiteSpace: 'nowrap',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
