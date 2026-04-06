import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import { platform } from '../utils/platform';

interface ShareSheetProps {
  recordingId: string;
  transcriptText: string | null;
  audioBlob: Blob | null;
  audioFileName: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function ShareSheet({
  transcriptText,
  audioBlob,
  audioFileName,
  onClose,
  onToast,
}: ShareSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const shareAudio = async () => {
    if (!audioBlob) return;
    const file = new File([audioBlob], audioFileName, { type: audioBlob.type });

    if (platform.supportsShare) {
      try {
        await navigator.share({ files: [file] });
        onClose();
        return;
      } catch {
        // Fall through to download
      }
    }

    // Fallback: download
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = audioFileName;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const shareTranscript = async () => {
    if (!transcriptText) return;

    if (platform.supportsShare) {
      try {
        await navigator.share({ text: transcriptText });
        onClose();
        return;
      } catch {
        // Fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(transcriptText);
      onToast('Transcript copied to clipboard');
    } catch {
      onToast('Could not copy transcript');
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 100,
      }}
    >
      <div
        ref={sheetRef}
        style={{
          background: '#fff',
          borderRadius: '16px 16px 0 0',
          padding: 24,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#202124' }}>Share</h3>

        <button
          onClick={shareAudio}
          disabled={!audioBlob}
          style={optionStyle(!audioBlob)}
        >
          🎵 Audio file
        </button>

        <button
          onClick={shareTranscript}
          disabled={!transcriptText}
          style={optionStyle(!transcriptText)}
        >
          📝 Transcript
        </button>

        <button
          onClick={onClose}
          style={{
            marginTop: 12,
            width: '100%',
            padding: 12,
            background: '#f8f9fa',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            cursor: 'pointer',
            color: '#202124',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function optionStyle(disabled: boolean): h.JSX.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: '14px 16px',
    background: '#f8f9fa',
    border: '1px solid #e8eaed',
    borderRadius: 8,
    fontSize: 16,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? '#bdc1c6' : '#202124',
    textAlign: 'left',
    marginBottom: 8,
  };
}
