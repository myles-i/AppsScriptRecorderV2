import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { AudioRecorder, type RecorderState } from '../audio/recorder';
import { WaveformVisualizer } from '../audio/waveform';
import { useWakeLock } from '../hooks/use-wake-lock';
import { getCurrentLocation, reverseGeocode } from '../utils/geo';
import { formatElapsedTime } from '../utils/format';
import type { GeoLocation, Recording } from '../api/types';
import type { AppScreen } from '../state/app-state';
import type { RecordingsCacheImpl } from '../cache/recordings-cache';
import type { AudioCacheImpl } from '../cache/audio-cache';
import type { MutationQueue } from '../queue/mutation-queue';
import { onRecordingComplete } from '../queue/operations';

interface RecordScreenProps {
  recordingsCache: RecordingsCacheImpl;
  audioCache: AudioCacheImpl;
  queue: MutationQueue;
  onNavigate: (screen: AppScreen) => void;
  onRecordingAdded: (recording: Recording) => void;
}

export function RecordScreen({ recordingsCache, audioCache, queue, onNavigate, onRecordingAdded }: RecordScreenProps) {
  const [recState, setRecState] = useState<RecorderState>({
    status: 'idle',
    elapsed: 0,
    amplitude: 0,
  });
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [locationLabel, setLocationLabel] = useState('Getting location...');
  const [backgroundWarning, setBackgroundWarning] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [discardConfirm, setDiscardConfirm] = useState(false);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<WaveformVisualizer | null>(null);
  const startedRef = useRef(false);

  useWakeLock(recState.status === 'recording');

  // Start recording on mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const recorder = new AudioRecorder(setRecState);
    recorderRef.current = recorder;

    recorder.start().catch((err: Error) => {
      if (err.name === 'NotAllowedError') {
        setPermissionError('Microphone access denied. Please enable it in your browser settings.');
      } else {
        setPermissionError('Could not start recording: ' + err.message);
      }
    });

    return () => {
      recorder.destroy();
    };
  }, []);

  // Get location
  useEffect(() => {
    getCurrentLocation().then((loc) => {
      if (loc) {
        setLocation(loc);
        setLocationLabel(loc.label);
        // Try to reverse-geocode for a better label
        reverseGeocode(loc.lat, loc.lng).then((label) => {
          if (label) {
            setLocation((prev) => prev ? { ...prev, label } : prev);
            setLocationLabel(label);
          }
        });
      } else {
        setLocationLabel('Unknown location');
      }
    });
  }, []);

  // Background detection
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const recorder = recorderRef.current;
        if (recorder && recorder.getState().status === 'idle' && startedRef.current) {
          setBackgroundWarning(true);
          // Emergency save
          const result = await recorder.emergencySave();
          if (result) {
            const ts = Date.now();
            const recording = await onRecordingComplete(
              {
                clientTimestamp: ts,
                audioData: result.audio,
                mimeType: result.mimeType,
                duration: result.duration,
                location,
              },
              { recordingsCache, audioCache, queue },
            );
            onRecordingAdded(recording);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [location]);

  const handleStop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const result = await recorder.stop();
    if (result) {
      const ts = Date.now();
      const recording = await onRecordingComplete(
        {
          clientTimestamp: ts,
          audioData: result.audio,
          mimeType: result.mimeType,
          duration: result.duration,
          location,
        },
        { recordingsCache, audioCache, queue },
      );
      onRecordingAdded(recording);
    }
    onNavigate({ name: 'browse' });
  }, [location, recordingsCache, audioCache, queue, onNavigate, onRecordingAdded]);

  const handlePause = () => recorderRef.current?.pause();
  const handleResume = () => recorderRef.current?.resume();

  const handleBack = () => {
    if (recState.status === 'recording' || recState.status === 'paused') {
      setDiscardConfirm(true);
    } else {
      onNavigate({ name: 'browse' });
    }
  };

  const handleDiscard = () => {
    recorderRef.current?.destroy();
    onNavigate({ name: 'browse' });
  };

  if (permissionError) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 24 }}>
          <button onClick={() => onNavigate({ name: 'browse' })} style={backBtnStyle}>← Back</button>
          <div style={{ textAlign: 'center', marginTop: 48, color: '#ea4335' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎙️</div>
            <p style={{ fontSize: 16 }}>{permissionError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Back button */}
      <button onClick={handleBack} style={backBtnStyle}>← Back</button>

      {/* Background warning */}
      {backgroundWarning && (
        <div
          style={{
            background: '#fef7e0',
            borderLeft: '4px solid #fbbc04',
            padding: '10px 16px',
            fontSize: 14,
            color: '#b06000',
            margin: '0 16px',
          }}
        >
          ⚠ App was in the background — recording may have paused.
        </div>
      )}

      {/* Location */}
      <div style={{ textAlign: 'center', color: '#5f6368', padding: '24px 16px 0', fontSize: 15 }}>
        📍 {locationLabel}
      </div>

      {/* Waveform */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <canvas
          ref={canvasRef}
          width={320}
          height={80}
          style={{ width: '100%', maxWidth: 320, border: '1px solid #e8eaed', borderRadius: 8 }}
        />
      </div>

      {/* Timer */}
      <div
        style={{
          textAlign: 'center',
          fontSize: 48,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 300,
          color: '#202124',
          letterSpacing: 2,
        }}
      >
        {formatElapsedTime(recState.elapsed)}
      </div>

      {/* Recording status dot */}
      <div style={{ textAlign: 'center', margin: '8px 0' }}>
        {recState.status === 'recording' && (
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ea4335', animation: 'pulse 1s infinite' }} />
        )}
        {recState.status === 'paused' && (
          <span style={{ color: '#fbbc04', fontSize: 13 }}>Paused</span>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '24px 16px 48px' }}>
        {recState.status === 'recording' ? (
          <button onClick={handlePause} style={ctrlBtnStyle('#fff', '#5f6368')}>
            ⏸ Pause
          </button>
        ) : recState.status === 'paused' ? (
          <button onClick={handleResume} style={ctrlBtnStyle('#fff', '#1a73e8')}>
            ▶ Resume
          </button>
        ) : null}

        <button
          onClick={handleStop}
          style={ctrlBtnStyle('#ea4335', '#fff')}
          disabled={recState.status === 'idle'}
        >
          ⏹ Stop
        </button>
      </div>

      {/* Discard confirmation */}
      {discardConfirm && (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <p style={{ margin: '0 0 16px', fontSize: 16 }}>Stop recording and discard?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDiscard}
                style={{ padding: '10px 20px', background: '#ea4335', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                Discard
              </button>
              <button
                onClick={() => setDiscardConfirm(false)}
                style={{ padding: '10px 20px', background: '#f8f9fa', color: '#202124', border: '1px solid #dadce0', borderRadius: 8, cursor: 'pointer' }}
              >
                Keep recording
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const containerStyle: h.JSX.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: '#fff',
};

const backBtnStyle: h.JSX.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: '#1a73e8',
  padding: '16px',
  textAlign: 'left',
};

function ctrlBtnStyle(bg: string, color: string): h.JSX.CSSProperties {
  return {
    padding: '14px 28px',
    background: bg,
    color,
    border: bg === '#fff' ? '1px solid #dadce0' : 'none',
    borderRadius: 30,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    minWidth: 120,
  };
}

const overlayStyle: h.JSX.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const dialogStyle: h.JSX.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 24,
  maxWidth: 320,
  width: '100%',
};
