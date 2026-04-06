import { h } from 'preact';
import { useState } from 'preact/hooks';

interface StepCreateProps {
  onNext: () => void;
}

export function StepCreate({ onNext }: StepCreateProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      // The backend source is bundled as a static text file
      const response = await fetch('/static/backend.gs.txt');
      const code = await response.text();
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Could not copy to clipboard. Please try manually.');
    }
  };

  return (
    <div style={stepStyle}>
      <h2 style={headingStyle}>Step 1: Create the backend project</h2>

      <ol style={listStyle}>
        <li>
          Go to{' '}
          <a href="https://script.google.com/create" target="_blank" rel="noopener noreferrer">
            script.google.com/create ↗
          </a>
        </li>
        <li>Name the project <strong>AppsScriptRecorder</strong></li>
        <li>Delete all existing code in the editor</li>
        <li>
          Click the button below to copy the backend code, then paste it into the editor
        </li>
        <li>Click the save icon (💾) or press Ctrl+S</li>
      </ol>

      <button onClick={handleCopyCode} style={copyBtnStyle}>
        {copied ? '✓ Copied!' : '📋 Copy backend code'}
      </button>

      <div style={{ background: '#e8f0fe', borderRadius: 8, padding: '12px 16px', marginTop: 20, fontSize: 14 }}>
        <strong>Already set up on another device?</strong> Find your existing project at{' '}
        <a href="https://script.google.com/home" target="_blank" rel="noopener noreferrer">
          script.google.com/home ↗
        </a>{' '}
        and skip to Step 3.
      </div>

      <button onClick={onNext} style={nextBtnStyle}>
        Next →
      </button>
    </div>
  );
}

const stepStyle: h.JSX.CSSProperties = { padding: '0 4px' };
const headingStyle: h.JSX.CSSProperties = { fontSize: 20, color: '#202124', margin: '0 0 20px' };
const listStyle: h.JSX.CSSProperties = { lineHeight: 2.2, color: '#202124', paddingLeft: 20 };
const copyBtnStyle: h.JSX.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 14,
  background: '#1a73e8',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: 20,
};
const nextBtnStyle: h.JSX.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 14,
  background: '#f8f9fa',
  color: '#202124',
  border: '1px solid #dadce0',
  borderRadius: 10,
  fontSize: 16,
  cursor: 'pointer',
  marginTop: 12,
};
