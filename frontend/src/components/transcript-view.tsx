import { h } from 'preact';
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import type { TranscriptSegment } from '../api/types';
import { formatElapsedTime } from '../utils/format';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  currentTime: number;
  isPlaying: boolean;
  searchQuery?: string;
  onSegmentTap: (time: number) => void;
}

function getActiveSegmentIndex(segments: TranscriptSegment[], time: number): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (time >= segments[i].start) return i;
  }
  return 0;
}

function highlight(text: string, query: string): h.JSX.Element {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ backgroundColor: '#fdd835', borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function TranscriptView({
  segments,
  currentTime,
  isPlaying,
  searchQuery = '',
  onSegmentTap,
}: TranscriptViewProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolled, setUserScrolled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);

  const activeIndex = useMemo(
    () => getActiveSegmentIndex(segments, currentTime),
    [segments, currentTime],
  );

  // Auto-scroll when active segment changes during playback
  useEffect(() => {
    if (!autoScroll || !activeRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const element = activeRef.current;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const midpoint = containerRect.top + containerRect.height / 2;

    if (elementRect.top > midpoint) {
      scrollingRef.current = true;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { scrollingRef.current = false; }, 500);
    }
  }, [activeIndex, autoScroll]);

  const onScroll = () => {
    if (isPlaying && !scrollingRef.current) {
      setUserScrolled(true);
      setAutoScroll(false);
    }
  };

  const jumpDirection = useMemo((): 'up' | 'down' | null => {
    if (!userScrolled || !activeRef.current || !containerRef.current) return null;
    const containerRect = containerRef.current.getBoundingClientRect();
    const elementRect = activeRef.current.getBoundingClientRect();
    if (elementRect.bottom < containerRect.top) return 'up';
    if (elementRect.top > containerRect.bottom) return 'down';
    return null;
  }, [activeIndex, userScrolled]);

  const handleJump = () => {
    setAutoScroll(true);
    setUserScrolled(false);
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSegmentTap = (start: number) => {
    setAutoScroll(true);
    setUserScrolled(false);
    onSegmentTap(start);
  };

  if (segments.length === 0) {
    return (
      <div style={{ color: '#5f6368', fontStyle: 'italic', padding: '16px 0', textAlign: 'center' }}>
        No transcript available
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        onScroll={onScroll}
        style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}
      >
        {segments.map((seg, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={seg.start}
              ref={isActive ? activeRef : undefined}
              onClick={() => handleSegmentTap(seg.start)}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                backgroundColor: isActive ? '#e8f0fe' : 'transparent',
                transition: 'background-color 0.2s',
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: '#5f6368',
                  marginRight: 8,
                  fontFamily: 'monospace',
                }}
              >
                [{formatElapsedTime(seg.start)}]
              </span>
              <span style={{ fontSize: 15, color: isActive ? '#1a73e8' : '#202124', fontWeight: isActive ? 500 : 400 }}>
                {highlight(seg.text, searchQuery)}
              </span>
            </div>
          );
        })}
      </div>

      {userScrolled && jumpDirection && (
        <button
          onClick={handleJump}
          style={{
            position: 'absolute',
            bottom: jumpDirection === 'down' ? 8 : undefined,
            top: jumpDirection === 'up' ? 8 : undefined,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a73e8',
            color: '#fff',
            border: 'none',
            borderRadius: 20,
            padding: '6px 16px',
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {jumpDirection === 'up' ? '↑' : '↓'} Jump to current
        </button>
      )}
    </div>
  );
}
