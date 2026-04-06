import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import type { Recording, Transcript } from '../api/types';
import type { ApiClient } from '../api/types';
import type { AudioCacheImpl } from '../cache/audio-cache';
import type { TranscriptCacheImpl } from '../cache/transcript-cache';
import type { RecordingsCacheImpl } from '../cache/recordings-cache';
import type { MutationQueue } from '../queue/mutation-queue';
import { usePlayback } from '../hooks/use-playback';
import { TranscriptView } from '../components/transcript-view';
import { SpeedControl } from '../components/speed-control';
import { ShareSheet } from '../components/share-sheet';
import { formatDuration, formatDateFull } from '../utils/format';
import { arrayBufferToBlob } from '../utils/audio-utils';
import type { AppScreen } from '../state/app-state';

interface PlaybackScreenProps {
  recordingId: string;
  seekTo?: number;
  api: ApiClient | null;
  audioCache: AudioCacheImpl;
  transcriptCache: TranscriptCacheImpl;
  recordingsCache: RecordingsCacheImpl;
  queue: MutationQueue;
  recordings: Recording[];
  onNavigate: (screen: AppScreen) => void;
}

export function PlaybackScreen({
  recordingId,
  seekTo,
  api,
  audioCache,
  transcriptCache,
  recordingsCache,
  queue,
  recordings,
  onNavigate,
}: PlaybackScreenProps) {
  const recording = recordings.find((r) => r.id === recordingId) ?? null;
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [title, setTitle] = useState(recording?.title ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [showSpeed, setShowSpeed] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const { playerState, play, pause, seek, skipForward, skipBackward, setRate } = usePlayback(
    recordingId,
    audioCache,
    api ?? undefined,
  );

  // Load transcript
  useEffect(() => {
    transcriptCache.get(recordingId).then((cached) => {
      if (cached) {
        setTranscript(cached);
      } else if (api) {
        api.getTranscript(recordingId).then((res) => {
          if (res.transcript) {
            setTranscript(res.transcript);
            transcriptCache.set(recordingId, res.transcript);
          }
        }).catch(() => null);
      }
    });
  }, [recordingId]);

  // Seek to initial position when ready
  useEffect(() => {
    if (seekTo !== undefined && playerState.status === 'ready') {
      seek(seekTo);
      play();
    }
  }, [seekTo, playerState.status]);

  // Load audio blob for sharing
  useEffect(() => {
    audioCache.get(recordingId).then((cached) => {
      if (cached) {
        setAudioBlob(arrayBufferToBlob(cached.data, cached.mimeType));
      }
    });
  }, [recordingId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handlePlayPause = () => {
    if (playerState.status === 'playing') pause();
    else play();
  };

  const handleTitleSave = async () => {
    const newTitle = titleInput.trim();
    if (!newTitle || newTitle === title) {
      setEditingTitle(false);
      return;
    }
    setTitle(newTitle);
    setEditingTitle(false);
    await recordingsCache.patch(recordingId, { title: newTitle });
    await queue.enqueue({ type: 'update-title', recordingId, title: newTitle });
  };

  const handleCopyTranscript = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript.text);
      setCopyConfirm(true);
      setTimeout(() => setCopyConfirm(false), 750);
    } catch {
      showToast('Could not copy transcript');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    // Optimistic delete
    await recordingsCache.remove(recordingId);
    await audioCache.remove(recordingId);
    await transcriptCache.remove(recordingId);
    await queue.enqueue({ type: 'delete', recordingId });
    onNavigate({ name: 'browse' });
  };

  const handleSeek = (e: MouseEvent | TouchEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(ratio * playerState.duration);
  };

  if (!recording) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#5f6368' }}>
        <button onClick={() => onNavigate({ name: 'browse' })} style={backBtnStyle}>← Back</button>
        <p>Recording not found.</p>
      </div>
    );
  }

  const progress = playerState.duration > 0 ? playerState.currentTime / playerState.duration : 0;
  const mapsUrl = recording.location
    ? `https://www.google.com/maps?q=${recording.location.lat},${recording.location.lng}`
    : null;
  const photosUrl = `https://photos.google.com/search/${encodeURIComponent(formatDateFull(recording.date))}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', overflowY: 'auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e8eaed' }}>
        <button onClick={() => onNavigate({ name: 'browse' })} style={backBtnStyle}>← Back</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleDelete}
          aria-label="Delete recording"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 4, color: deleteConfirm ? '#ea4335' : '#5f6368' }}
        >
          🗑
        </button>
      </div>

      {deleteConfirm && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ background: '#fce8e6', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 14, color: '#c5221f' }}>
              Delete this recording permanently from Drive?
            </span>
            <button onClick={handleDelete} style={{ background: '#ea4335', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
            <button onClick={() => setDeleteConfirm(false)} style={{ background: '#fff', border: '1px solid #dadce0', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 16px 0' }}>
        {/* Title */}
        {editingTitle ? (
          <div style={{ marginBottom: 8 }}>
            <input
              autoFocus
              value={titleInput}
              onInput={(e) => setTitleInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSave();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              onBlur={handleTitleSave}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 22, fontWeight: 600, padding: '4px 8px', border: '2px solid #1a73e8', borderRadius: 6 }}
            />
          </div>
        ) : (
          <h1
            onClick={() => { setEditingTitle(true); setTitleInput(title || recording.title || ''); }}
            style={{ fontSize: 22, fontWeight: 600, color: '#202124', margin: '0 0 8px', cursor: 'pointer' }}
            title="Tap to edit"
          >
            {title || recording.title || formatDateFull(recording.date)}
          </h1>
        )}

        {/* Metadata */}
        {recording.location && (
          <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: '#1a73e8', fontSize: 14, marginBottom: 4, textDecoration: 'none' }}>
            📍 {recording.location.label} ↗
          </a>
        )}
        <a href={photosUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: '#1a73e8', fontSize: 14, marginBottom: 16, textDecoration: 'none' }}>
          📷 Search Google Photos for this date ↗
        </a>

        {/* Progress bar */}
        <div
          style={{ marginBottom: 4, cursor: 'pointer', padding: '8px 0' }}
          onClick={handleSeek}
          onTouchStart={handleSeek}
        >
          <div style={{ background: '#e8eaed', height: 4, borderRadius: 2, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: '#1a73e8', borderRadius: 2, width: `${progress * 100}%` }} />
            <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: `${progress * 100}%`, marginLeft: -6, width: 12, height: 12, borderRadius: '50%', background: '#1a73e8' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5f6368', marginBottom: 16 }}>
          <span>{formatDuration(playerState.currentTime)}</span>
          <span>{formatDuration(playerState.duration || recording.duration)}</span>
        </div>

        {/* Playback controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
          <button onClick={skipBackward} style={ctrlBtn}>⏪ 15</button>
          <button
            onClick={handlePlayPause}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: playerState.status === 'error' ? '#ea4335' : '#1a73e8',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {playerState.status === 'loading' ? '⏳' :
             playerState.status === 'error' ? '!' :
             playerState.status === 'playing' ? '⏸' : '▶'}
          </button>
          <button onClick={skipForward} style={ctrlBtn}>15 ⏩</button>
          <button
            onClick={() => setShowSpeed(true)}
            style={{ ...ctrlBtn, background: '#f8f9fa', border: '1px solid #dadce0' }}
          >
            {playerState.playbackRate.toFixed(1)}×
          </button>
        </div>

        {/* Transcript */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 16, color: '#202124' }}>Transcript</h2>
            <button
              onClick={handleCopyTranscript}
              disabled={!transcript}
              aria-label="Copy transcript"
              style={{ background: 'none', border: 'none', cursor: transcript ? 'pointer' : 'default', fontSize: 18, color: transcript ? '#1a73e8' : '#bdc1c6' }}
            >
              {copyConfirm ? '✓' : '📋'}
            </button>
          </div>

          {transcript ? (
            <TranscriptView
              segments={transcript.segments}
              currentTime={playerState.currentTime}
              isPlaying={playerState.status === 'playing'}
              onSegmentTap={(time) => { seek(time); play(); }}
            />
          ) : (
            <p style={{ color: '#5f6368', fontStyle: 'italic', fontSize: 14 }}>
              {recording.hasTranscript ? 'Loading transcript...' : 'No transcript available'}
            </p>
          )}
        </div>

        {/* Share button */}
        <button
          onClick={() => setShowShare(true)}
          style={{ width: '100%', padding: 12, background: '#f8f9fa', border: '1px solid #e8eaed', borderRadius: 8, fontSize: 15, cursor: 'pointer', marginBottom: 32 }}
        >
          Share ↗
        </button>
      </div>

      {/* Speed control bottom sheet */}
      {showSpeed && (
        <SpeedControl
          currentRate={playerState.playbackRate}
          onRateChange={setRate}
          onClose={() => setShowSpeed(false)}
        />
      )}

      {/* Share bottom sheet */}
      {showShare && (
        <ShareSheet
          recordingId={recordingId}
          transcriptText={transcript?.text ?? null}
          audioBlob={audioBlob}
          audioFileName={`recording-${recordingId}.${recording.mimeType.includes('mp4') ? 'mp4' : 'webm'}`}
          onClose={() => setShowShare(false)}
          onToast={showToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(32,33,36,0.9)', color: '#fff', padding: '10px 20px', borderRadius: 24, fontSize: 14, zIndex: 50 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const backBtnStyle: h.JSX.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: '#1a73e8',
  padding: 4,
};

const ctrlBtn: h.JSX.CSSProperties = {
  padding: '10px 16px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 15,
  color: '#202124',
  borderRadius: 8,
};
