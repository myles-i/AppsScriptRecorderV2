import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';

interface SpeedControlProps {
  currentRate: number;
  onRateChange: (rate: number) => void;
  onClose: () => void;
}

const PRESETS = [1, 1.2, 1.4, 1.6, 1.8, 2];

export function SpeedControl({ currentRate, onRateChange, onClose }: SpeedControlProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 100,
      }}
    >
      <div
        ref={sheetRef}
        style={{
          background: '#fff',
          borderRadius: '16px 16px 0 0',
          padding: 24,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#202124' }}>Playback speed</h3>

        {/* Continuous slider */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="range"
            min={0.6}
            max={3.0}
            step={0.1}
            value={currentRate}
            onInput={(e) => onRateChange(parseFloat((e.target as HTMLInputElement).value))}
            style={{ width: '100%' }}
          />
          <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 600, color: '#1a73e8' }}>
            {currentRate.toFixed(1)}×
          </div>
        </div>

        {/* Preset buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {PRESETS.map((rate) => (
            <button
              key={rate}
              onClick={() => onRateChange(rate)}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                border: '2px solid',
                borderColor: Math.abs(currentRate - rate) < 0.05 ? '#1a73e8' : '#dadce0',
                background: Math.abs(currentRate - rate) < 0.05 ? '#e8f0fe' : '#fff',
                color: Math.abs(currentRate - rate) < 0.05 ? '#1a73e8' : '#202124',
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              {rate}×
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 20,
            width: '100%',
            padding: 12,
            background: '#f8f9fa',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            cursor: 'pointer',
            color: '#202124',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
