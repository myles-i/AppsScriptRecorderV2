import { h } from 'preact';

interface StepDeployProps {
  onNext: () => void;
  onBack: () => void;
}

export function StepDeploy({ onNext, onBack }: StepDeployProps) {
  return (
    <div style={{ padding: '0 4px' }}>
      <h2 style={{ fontSize: 20, color: '#202124', margin: '0 0 20px' }}>
        Step 2: Deploy as a Web App
      </h2>

      <p style={{ color: '#5f6368', marginBottom: 16 }}>
        Follow these steps in the Apps Script editor:
      </p>

      <ol style={{ lineHeight: 2.4, color: '#202124', paddingLeft: 20 }}>
        <li>Click <strong>Deploy</strong> (top right)</li>
        <li>Select <strong>New deployment</strong></li>
        <li>Click the gear icon and choose <strong>Web app</strong></li>
        <li>Set <strong>Execute as</strong> to <strong>Me</strong></li>
        <li>Set <strong>Who has access</strong> to <strong>Anyone</strong></li>
        <li>Click <strong>Deploy</strong></li>
        <li>Click <strong>Authorize access</strong> and approve the permissions</li>
        <li>
          <strong>Copy the Web App URL</strong> — you'll need it in the next step
        </li>
      </ol>

      <div style={{ background: '#fef7e0', borderRadius: 8, padding: '12px 16px', marginTop: 16, fontSize: 14 }}>
        <strong>Important:</strong> The URL looks like:<br />
        <code style={{ fontSize: 12, wordBreak: 'break-all' }}>
          https://script.google.com/macros/s/ABC.../exec
        </code>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <button onClick={onBack} style={secondaryBtn}>← Back</button>
        <button onClick={onNext} style={primaryBtn}>Next →</button>
      </div>
    </div>
  );
}

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
