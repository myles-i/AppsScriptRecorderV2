import { h } from 'preact';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search recordings...' }: SearchBarProps) {
  return (
    <div style={{ position: 'relative', margin: '8px 0' }}>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 16,
          color: '#5f6368',
          pointerEvents: 'none',
        }}
      >
        🔍
      </span>
      <input
        type="search"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 12px 10px 36px',
          border: '1px solid #dadce0',
          borderRadius: 24,
          fontSize: 15,
          outline: 'none',
          background: '#f8f9fa',
          color: '#202124',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: '#5f6368',
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
