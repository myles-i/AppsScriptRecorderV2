import { h } from 'preact';

interface UpdateModalProps {
  type: 'app' | 'backend';
  onApply: () => void;
  onDismiss: () => void;
  backendSourceUrl?: string;
}

export function UpdateModal({ type, onApply, onDismiss }: UpdateModalProps) {
  if (type === 'app') {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <h3 style={{ margin: '0 0 12px' }}>App update available</h3>
          <p style={{ color: '#5f6368', marginBottom: 16 }}>
            A new version of Voice Recorder is available.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onApply} style={primaryBtn}>Reload</button>
            <button onClick={onDismiss} style={secondaryBtn}>Later</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ margin: '0 0 12px' }}>Backend update available</h3>
        <p style={{ color: '#5f6368', marginBottom: 16 }}>
          Your Apps Script backend needs updating. No URL changes — your existing setup on all devices keeps working.
        </p>
        <ol style={{ color: '#202124', paddingLeft: 20, lineHeight: 1.8 }}>
          <li>
            <a href="https://script.google.com/home" target="_blank" rel="noopener noreferrer">
              Open your existing project ↗
            </a>
          </li>
          <li>Replace the code with the latest version</li>
          <li>Deploy → Manage Deployments → Edit → New Version → Deploy</li>
        </ol>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onDismiss} style={secondaryBtn}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: h.JSX.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const modalStyle: h.JSX.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 24,
  maxWidth: 400,
  width: '100%',
};

const primaryBtn: h.JSX.CSSProperties = {
  padding: '10px 20px',
  background: '#1a73e8',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtn: h.JSX.CSSProperties = {
  padding: '10px 20px',
  background: '#f8f9fa',
  color: '#202124',
  border: '1px solid #dadce0',
  borderRadius: 8,
  fontSize: 15,
  cursor: 'pointer',
};
