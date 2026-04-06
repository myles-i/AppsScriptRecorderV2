import { h } from 'preact';
import type { Recording } from '../api/types';
import { formatDuration, formatRelativeDate } from '../utils/format';

interface RecordingCardProps {
  recording: Recording;
  isUploading?: boolean;
  uploadFailed?: boolean;
  transcribeFailed?: boolean;
  searchQuery?: string;
  searchSnippets?: string[];
  onClick: () => void;
}

function highlightText(text: string, query: string): h.JSX.Element {
  if (!query.trim()) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark style={{ backgroundColor: '#fdd835', borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

export function RecordingCard({
  recording,
  isUploading,
  uploadFailed,
  transcribeFailed,
  searchQuery = '',
  searchSnippets = [],
  onClick,
}: RecordingCardProps) {
  const title = recording.title ?? formatRelativeDate(recording.date);
  const subtitle = [
    recording.location?.label,
    formatRelativeDate(recording.date),
    formatDuration(recording.duration),
  ]
    .filter(Boolean)
    .join(' · ');

  let statusText: string | null = null;
  if (isUploading) statusText = 'Saving and transcribing...';
  else if (uploadFailed) statusText = 'Upload failed — will retry on next visit';
  else if (transcribeFailed) statusText = 'Transcription failed — will retry on next visit';
  else if (!recording.hasTranscript && !isUploading) statusText = 'Transcribing...';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: '#fff',
        border: '1px solid #e8eaed',
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'box-shadow 0.1s',
        marginBottom: 8,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 16, color: '#202124', marginBottom: 2 }}>
        {highlightText(title, searchQuery)}
      </div>
      <div style={{ fontSize: 13, color: '#5f6368', marginBottom: 6 }}>{subtitle}</div>

      {statusText ? (
        <div style={{ fontSize: 13, color: '#1a73e8', fontStyle: 'italic' }}>
          {statusText}
        </div>
      ) : recording.preview ? (
        <div style={{ fontSize: 14, color: '#3c4043', lineHeight: 1.5 }}>
          {highlightText(recording.preview, searchQuery)}
        </div>
      ) : null}

      {searchSnippets.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {searchSnippets.map((snippet, i) => (
            <div
              key={i}
              style={{
                fontSize: 13,
                color: '#5f6368',
                fontStyle: 'italic',
                marginTop: 2,
              }}
            >
              {highlightText(snippet, searchQuery)}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
