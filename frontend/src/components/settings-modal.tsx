import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { Settings } from '../api/types';
import type { ApiClient } from '../api/types';
import {
  getBrowserNickname,
  getSettings,
  saveSettings,
  clearAllSettings,
  getAuthFileInfo,
} from '../cache/settings-cache';

interface SettingsModalProps {
  api: ApiClient | null;
  onClose: () => void;
  onDisconnect: () => void;
  onRebuildIndex: () => void;
  backendUrl: string | null;
}

export function SettingsModal({
  api,
  onClose,
  onDisconnect,
  onRebuildIndex,
  backendUrl,
}: SettingsModalProps) {
  const [nickname, setNickname] = useState('My Browser');
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({
    transcriptionMode: 'openai_first',
    autoUpgrade: false,
    onDeviceModel: 'tiny',
  });
  const [apiKeyStatus, setApiKeyStatus] = useState<{ configured: boolean; valid: boolean } | null>(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  useEffect(() => {
    getBrowserNickname().then(setNickname);
    getSettings().then(setSettings);
    getAuthFileInfo().then((info) => setFolderUrl(info.folderUrl));
    if (api) {
      api.getApiKeyStatus().then(setApiKeyStatus).catch(() => null);
    }
  }, [api]);

  const handleSettingChange = async (next: Settings) => {
    setSettings(next);
    await saveSettings(next);
    if (api) {
      api.saveSettings(next).catch(() => null);
    }
  };

  const handleSaveApiKey = async () => {
    if (!api || !apiKeyInput.trim()) return;
    setSaving(true);
    setApiKeyError('');
    try {
      const result = await api.saveApiKey(apiKeyInput.trim());
      if (result.valid) {
        setApiKeyStatus({ configured: true, valid: true });
        setShowApiKeyInput(false);
        setApiKeyInput('');
      } else {
        setApiKeyError('Invalid API key. Please check and try again.');
      }
    } catch {
      setApiKeyError('Failed to validate API key. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!backendUrl) return;
    await navigator.clipboard.writeText(backendUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRebuild = async () => {
    if (!api) return;
    setRebuilding(true);
    try {
      await onRebuildIndex();
    } finally {
      setRebuilding(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectConfirm) {
      setDisconnectConfirm(true);
      return;
    }
    if (api) {
      const stored = await getBrowserNickname();
      const token = (await getAuthFileInfo()).fileId; // Not ideal but placeholder
      try {
        await api.revokeAccess(token ?? '');
      } catch {
        // Best effort
      }
    }
    await clearAllSettings();
    onDisconnect();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          background: '#fff',
          flex: 1,
          overflowY: 'auto',
          borderRadius: '16px 16px 0 0',
          marginTop: 48,
          padding: 24,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 20 }}>Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24 }}
          >
            ×
          </button>
        </div>

        {/* Browser Info */}
        <Section title="Browser Info">
          <p style={p}>Nickname: <strong>{nickname}</strong></p>
          {folderUrl && (
            <a href={folderUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
              Open Drive folder ↗
            </a>
          )}
        </Section>

        {/* API Key */}
        <Section title="OpenAI API Key">
          {apiKeyStatus ? (
            <p style={p}>
              Status:{' '}
              <span style={{ color: apiKeyStatus.valid ? '#34a853' : '#f29900', fontWeight: 600 }}>
                {apiKeyStatus.valid ? '✓ Configured' : '⚠ Not set'}
              </span>
            </p>
          ) : (
            <p style={p}>Loading...</p>
          )}
          {!showApiKeyInput ? (
            <button onClick={() => setShowApiKeyInput(true)} style={btnStyle}>
              {apiKeyStatus?.configured ? 'Update key' : 'Add key'}
            </button>
          ) : (
            <div>
              <input
                type="password"
                value={apiKeyInput}
                onInput={(e) => setApiKeyInput((e.target as HTMLInputElement).value)}
                placeholder="sk-..."
                style={inputStyle}
              />
              {apiKeyError && <p style={{ color: '#ea4335', fontSize: 13 }}>{apiKeyError}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleSaveApiKey} disabled={saving} style={btnStyle}>
                  {saving ? 'Validating...' : 'Validate & Save'}
                </button>
                <button
                  onClick={() => { setShowApiKeyInput(false); setApiKeyError(''); }}
                  style={{ ...btnStyle, background: '#f8f9fa', color: '#5f6368' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* Transcription Settings */}
        <Section title="Transcription Settings">
          <label style={labelStyle}>Mode</label>
          {(['openai_first', 'always_local', 'openai_only'] as const).map((mode) => (
            <label key={mode} style={radioLabelStyle}>
              <input
                type="radio"
                name="transcription-mode"
                value={mode}
                checked={settings.transcriptionMode === mode}
                onChange={() => handleSettingChange({ ...settings, transcriptionMode: mode })}
              />
              {' '}
              {mode === 'openai_first'
                ? 'OpenAI first, on-device fallback'
                : mode === 'always_local'
                ? 'Always on-device'
                : 'OpenAI only'}
            </label>
          ))}

          {settings.transcriptionMode === 'openai_first' && (
            <label style={{ ...radioLabelStyle, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={settings.autoUpgrade}
                onChange={(e) =>
                  handleSettingChange({ ...settings, autoUpgrade: (e.target as HTMLInputElement).checked })
                }
              />
              {' '}
              Auto-upgrade local transcriptions with OpenAI when available
            </label>
          )}

          {settings.transcriptionMode !== 'openai_only' && (
            <>
              <label style={labelStyle}>On-device model</label>
              {([
                { value: 'tiny', label: 'Tiny (~40 MB) — recommended' },
                { value: 'base', label: 'Base (~75 MB)' },
                { value: 'small', label: 'Small (~250 MB)' },
              ] as const).map(({ value, label }) => (
                <label key={value} style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="on-device-model"
                    value={value}
                    checked={settings.onDeviceModel === value}
                    onChange={() => handleSettingChange({ ...settings, onDeviceModel: value })}
                  />
                  {' '}{label}
                </label>
              ))}
            </>
          )}
        </Section>

        {/* Adding Another Device */}
        {backendUrl && (
          <Section title="Adding Another Device">
            <p style={p}>
              Open the app on the new device and go through the setup wizard. Use this Web App URL:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code
                style={{
                  flex: 1,
                  background: '#f8f9fa',
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  wordBreak: 'break-all',
                  border: '1px solid #e8eaed',
                }}
              >
                {backendUrl}
              </code>
              <button onClick={handleCopyUrl} style={btnStyle}>
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </Section>
        )}

        {/* Maintenance */}
        <Section title="Maintenance">
          <button onClick={handleRebuild} disabled={rebuilding} style={btnStyle}>
            {rebuilding ? 'Rebuilding...' : 'Rebuild Index'}
          </button>
          <p style={{ ...p, marginTop: 4, fontSize: 13 }}>
            Use this if recordings are missing from the list.
          </p>
        </Section>

        {/* Disconnect */}
        <Section title="Disconnect">
          <p style={p}>
            This will revoke access and clear all local data. Your recordings in Drive are not affected.
          </p>
          {disconnectConfirm ? (
            <div>
              <p style={{ color: '#ea4335', fontSize: 14, fontWeight: 600 }}>
                Are you sure? This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleDisconnect}
                  style={{ ...btnStyle, background: '#ea4335', color: '#fff' }}
                >
                  Yes, disconnect
                </button>
                <button
                  onClick={() => setDisconnectConfirm(false)}
                  style={{ ...btnStyle, background: '#f8f9fa', color: '#5f6368' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleDisconnect}
              style={{ ...btnStyle, background: '#fce8e6', color: '#c5221f', border: '1px solid #ea4335' }}
            >
              Disconnect this browser
            </button>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: h.JSX.Element | h.JSX.Element[] }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#5f6368', borderBottom: '1px solid #e8eaed', paddingBottom: 8 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

const p: h.JSX.CSSProperties = { margin: '0 0 8px', fontSize: 14, color: '#202124', lineHeight: 1.5 };
const labelStyle: h.JSX.CSSProperties = { display: 'block', fontSize: 13, color: '#5f6368', margin: '12px 0 6px', fontWeight: 600 };
const radioLabelStyle: h.JSX.CSSProperties = { display: 'block', fontSize: 14, color: '#202124', marginBottom: 6, cursor: 'pointer' };
const btnStyle: h.JSX.CSSProperties = {
  padding: '8px 16px',
  background: '#e8f0fe',
  border: 'none',
  borderRadius: 8,
  color: '#1a73e8',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};
const inputStyle: h.JSX.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1px solid #dadce0',
  borderRadius: 8,
  fontSize: 14,
};
const linkStyle: h.JSX.CSSProperties = { color: '#1a73e8', fontSize: 14 };
