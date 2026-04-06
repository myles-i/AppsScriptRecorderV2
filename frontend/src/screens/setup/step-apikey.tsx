import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiClient } from '../../api/types';

interface StepApiKeyProps {
  api: ApiClient;
  onComplete: () => void;
}

export function StepApiKey({ api, onComplete }: StepApiKeyProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const key = apiKey.trim();
    if (!key) return;

    setSaving(true);
    setError('');
    try {
      const result = await api.saveApiKey(key);
      if (result.valid) {
        onComplete();
      } else {
        setError('API key appears to be invalid. Please check it and try again.');
      }
    } catch {
      setError('Failed to validate API key. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '0 4px' }}>
      <h2 style={{ fontSize: 20, color: '#202124', margin: '0 0 20px' }}>
        Step 4: OpenAI API Key (optional)
      </h2>

      <p style={{ color: '#202124', lineHeight: 1.7, marginBottom: 12 }}>
        Voice Recorder can transcribe your recordings using OpenAI Whisper — a highly accurate
        speech recognition service. This is optional; the app includes free on-device transcription.
      </p>

      <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, lineHeight: 1.7 }}>
        <strong>Cost estimate:</strong> ~$0.006 per minute of audio (~$0.03 for a 5-minute recording)
      </div>

      <p style={{ color: '#5f6368', fontSize: 14, marginBottom: 16 }}>
        Get an API key at{' '}
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
          platform.openai.com/api-keys ↗
        </a>
        . Your key is stored on your server — never in this browser.
      </p>

      <input
        type="password"
        value={apiKey}
        onInput={(e) => { setApiKey((e.target as HTMLInputElement).value); setError(''); }}
        placeholder="sk-..."
        style={{
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 12px',
          border: '1px solid #dadce0',
          borderRadius: 8,
          fontSize: 14,
          marginBottom: 8,
        }}
      />

      {error && <p style={{ color: '#ea4335', fontSize: 14 }}>{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !apiKey.trim()}
        style={{
          display: 'block',
          width: '100%',
          padding: 14,
          background: '#1a73e8',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 600,
          cursor: saving || !apiKey.trim() ? 'default' : 'pointer',
          opacity: saving || !apiKey.trim() ? 0.6 : 1,
          marginBottom: 8,
        }}
      >
        {saving ? 'Validating...' : 'Validate & Save'}
      </button>

      <button
        onClick={onComplete}
        style={{
          display: 'block',
          width: '100%',
          padding: 14,
          background: '#f8f9fa',
          color: '#5f6368',
          border: '1px solid #dadce0',
          borderRadius: 10,
          fontSize: 16,
          cursor: 'pointer',
        }}
      >
        Skip — I'll use on-device transcription
      </button>
    </div>
  );
}
