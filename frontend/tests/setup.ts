import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// ─── MediaDevices ───────────────────────────────────────────────────────────

const mockStream = {
  getTracks: () => [{ stop: vi.fn() }],
  getAudioTracks: () => [{ stop: vi.fn() }],
} as unknown as MediaStream;

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue(mockStream),
  },
  writable: true,
});

// ─── MediaRecorder ───────────────────────────────────────────────────────────

const MockMediaRecorder = vi.fn().mockImplementation((_stream: MediaStream, opts?: MediaRecorderOptions) => {
  const instance = {
    state: 'inactive' as RecordingState,
    mimeType: opts?.mimeType ?? 'audio/webm',
    ondataavailable: null as ((e: BlobEvent) => void) | null,
    onstop: null as (() => void) | null,
    start: vi.fn().mockImplementation(function (this: typeof instance) {
      this.state = 'recording';
    }),
    stop: vi.fn().mockImplementation(function (this: typeof instance) {
      this.state = 'inactive';
      this.onstop?.();
    }),
    pause: vi.fn().mockImplementation(function (this: typeof instance) {
      this.state = 'paused';
    }),
    resume: vi.fn().mockImplementation(function (this: typeof instance) {
      this.state = 'recording';
    }),
  };
  return instance;
});
(MockMediaRecorder as unknown as { isTypeSupported: (t: string) => boolean }).isTypeSupported =
  vi.fn().mockImplementation((type: string) => {
    return type === 'audio/mp4' || type === 'audio/webm' || type === 'audio/webm;codecs=opus';
  });

globalThis.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;

// ─── AudioContext ─────────────────────────────────────────────────────────────

const mockAnalyser = {
  frequencyBinCount: 1024,
  getByteTimeDomainData: vi.fn(),
  connect: vi.fn(),
};

const mockSource = {
  connect: vi.fn(),
  disconnect: vi.fn(),
};

globalThis.AudioContext = vi.fn().mockImplementation(() => ({
  state: 'running',
  sampleRate: 44100,
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
  createMediaStreamSource: vi.fn().mockReturnValue(mockSource),
})) as unknown as typeof AudioContext;

// ─── OfflineAudioContext ──────────────────────────────────────────────────────

const mockRendered = {
  duration: 5,
  getChannelData: vi.fn().mockReturnValue(new Float32Array(80000)),
};

globalThis.OfflineAudioContext = vi.fn().mockImplementation(() => ({
  decodeAudioData: vi.fn().mockResolvedValue({ duration: 5 }),
  createBufferSource: vi.fn().mockReturnValue({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
  }),
  destination: {},
  startRendering: vi.fn().mockResolvedValue(mockRendered),
})) as unknown as typeof OfflineAudioContext;

// ─── URL / Blobs ─────────────────────────────────────────────────────────────

globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
globalThis.URL.revokeObjectURL = vi.fn();

// ─── Clipboard ───────────────────────────────────────────────────────────────

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

// ─── Wake Lock ────────────────────────────────────────────────────────────────

Object.defineProperty(navigator, 'wakeLock', {
  value: { request: vi.fn().mockResolvedValue({ release: vi.fn() }) },
  writable: true,
});

// ─── Service Worker ───────────────────────────────────────────────────────────

Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    register: vi.fn().mockResolvedValue({}),
    controller: null,
  },
  writable: true,
});

// ─── Reset all mocks between tests ───────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});
