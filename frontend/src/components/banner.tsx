import { h } from 'preact';

interface BannerProps {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

const COLORS = {
  info: { bg: '#e8f0fe', border: '#4285f4', text: '#1a73e8' },
  warning: { bg: '#fef7e0', border: '#fbbc04', text: '#b06000' },
  error: { bg: '#fce8e6', border: '#ea4335', text: '#c5221f' },
  success: { bg: '#e6f4ea', border: '#34a853', text: '#137333' },
};

export function Banner({ type, message, action, onDismiss }: BannerProps) {
  const colors = COLORS[type];
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        backgroundColor: colors.bg,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: 4,
        margin: '4px 0',
      }}
    >
      <span style={{ flex: 1, fontSize: 14, color: '#202124' }}>{message}</span>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: colors.text,
            fontWeight: 600,
            fontSize: 14,
            padding: '2px 8px',
          }}
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#5f6368',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 4px',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
