import { h } from 'preact';
import { useState } from 'preact/hooks';
import { RealApiClient } from '../../api/client';
import { saveBackendUrl, saveToken, saveBrowserNickname, saveAuthFileInfo } from '../../cache/settings-cache';
import { resetApiClient } from '../../api/index';

interface StepConnectProps {
  onAuthorize: (token: string, fileId: string, fileName: string, folderUrl: string) => void;
  onBack: () => void;
}

export function StepConnect({ onAuthorize, onBack }: StepConnectProps) {
  const [url, setUrl] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isValidUrl = (u: string) =>
    u.trim().startsWith('https://script.google.com/macros/s/');

  const handleConnect = async () => {
    const trimmedUrl = url.trim();
    if (!isValidUrl(trimmedUrl)) {
      setError('URL must start with https://script.google.com/macros/s/');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const nick = nickname.trim() || 'My Browser';
      await saveBackendUrl(trimmedUrl);
      await saveBrowserNickname(nick);
      resetApiClient();

      const client = new RealApiClient(trimmedUrl, null);
      const result = await client.requestAccess(nick);

      await saveToken(result.token);
      await saveAuthFileInfo(result.fileId, result.fileName, result.folderUrl);
      resetApiClient();

      onAuthorize(result.token, result.fileId, result.fileName, result.folderUrl);
    } catch (err) {
      setError('Could not connect to backend. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '0 4px' }}>
      <h2 style={{ fontSize: 20, color: '#202124', margin: '0 0 20px' }}>
        Step 3: Connect this browser
      </h2>

      <label style={labelStyle}>
        Web App URL
        <input
          type="url"
          value={url}
          onInput={(e) => { setUrl((e.target as HTMLInputElement).value); setError(''); }}
          placeholder="https://script.google.com/macros/s/..."
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        Browser nickname (optional)
        <input
          type="text"
          value={nickname}
          onInput={(e) => setNickname((e.target as HTMLInputElement).value)}
          placeholder="My iPhone"
          maxLength={50}
          style={inputStyle}
        />
      </label>

      {error && <p style={{ color: '#ea4335', fontSize: 14 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button onClick={onBack} style={secondaryBtn}>← Back</button>
        <button
          onClick={handleConnect}
          disabled={loading || !url.trim()}
          style={{ ...primaryBtn, opacity: loading || !url.trim() ? 0.6 : 1 }}
        >
          {loading ? 'Connecting...' : 'Request Access'}
        </button>
      </div>
    </div>
  );
}

const labelStyle: h.JSX.CSSProperties = { display: 'block', fontSize: 14, color: '#202124', marginBottom: 16 };
const inputStyle: h.JSX.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 6,
  padding: '10px 12px',
  border: '1px solid #dadce0',
  borderRadius: 8,
  fontSize: 14,
};
const primaryBtn: h.JSX.CSSProperties = {
  flex: 1,
  padding: 14,
  background: '#1a73e8',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
};
const secondaryBtn: h.JSX.CSSProperties = {
  padding: '14px 20px',
  background: '#f8f9fa',
  color: '#202124',
  border: '1px solid #dadce0',
  borderRadius: 10,
  fontSize: 16,
  cursor: 'pointer',
};
