import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { getApiClient } from '../../api/index';

interface StepAuthorizeProps {
  token: string;
  fileId: string;
  fileName: string;
  folderUrl: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export function StepAuthorize({ token, fileId, fileName, folderUrl, onSuccess, onCancel }: StepAuthorizeProps) {
  const [elapsed, setElapsed] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const poll = async () => {
      try {
        const api = getApiClient();
        const result = await api.checkAuth(token, fileId);
        if (result.authorized) {
          if (pollRef.current) clearInterval(pollRef.current);
          onSuccess();
          return;
        }
      } catch {
        // Continue polling
      }

      const elapsed = Date.now() - startRef.current;
      setElapsed(Math.floor(elapsed / 1000));

      if (elapsed >= MAX_POLL_DURATION_MS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setTimedOut(true);
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    poll(); // Immediate first check

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, fileId, onSuccess]);

  if (timedOut) {
    return (
      <div style={{ padding: '0 4px' }}>
        <h2 style={{ fontSize: 20, color: '#202124', margin: '0 0 20px' }}>Authorization timed out</h2>
        <p style={{ color: '#5f6368' }}>
          We waited 10 minutes but the file was not starred. Please try again.
        </p>
        <button onClick={onCancel} style={secondaryBtn}>← Try again</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 4px' }}>
      <h2 style={{ fontSize: 20, color: '#202124', margin: '0 0 20px' }}>
        Step 3b: Authorize
      </h2>

      <p style={{ color: '#202124', lineHeight: 1.7, marginBottom: 16 }}>
        To authorize this browser, <strong>star the following file</strong> in your Google Drive:
      </p>

      <div style={{ background: '#f8f9fa', border: '1px solid #e8eaed', borderRadius: 8, padding: '12px 16px', marginBottom: 16, wordBreak: 'break-all' }}>
        <code style={{ fontSize: 14 }}>{fileName}</code>
      </div>

      <a
        href={folderUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'block', padding: '12px 16px', background: '#e8f0fe', color: '#1a73e8', borderRadius: 8, textDecoration: 'none', fontWeight: 600, textAlign: 'center', marginBottom: 20 }}
      >
        Open Drive folder ↗
      </a>

      <p style={{ color: '#5f6368', fontSize: 14, lineHeight: 1.7 }}>
        By starring this file, you grant this browser permanent access to your recordings.
        Only someone with access to your Google Drive can do this.
      </p>

      {/* Spinner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', color: '#5f6368', fontSize: 14 }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 20 }}>⏳</span>
        Waiting for authorization... ({elapsed}s)
      </div>

      <button onClick={onCancel} style={secondaryBtn}>Cancel</button>
    </div>
  );
}

const secondaryBtn: h.JSX.CSSProperties = {
  padding: '12px 20px',
  background: '#f8f9fa',
  color: '#202124',
  border: '1px solid #dadce0',
  borderRadius: 10,
  fontSize: 16,
  cursor: 'pointer',
  marginTop: 12,
};
