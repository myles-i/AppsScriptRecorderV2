import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioRecorder, getPreferredMimeType } from '../../../src/audio/recorder';

// Reset isTypeSupported to the default "all supported" implementation before each test
// to prevent the getPreferredMimeType suite's per-test overrides from bleeding in.
beforeEach(() => {
  (MediaRecorder.isTypeSupported as ReturnType<typeof vi.fn>).mockImplementation(
    (type: string) =>
      type === 'audio/mp4' ||
      type === 'audio/webm;codecs=opus' ||
      type === 'audio/webm',
  );
});

describe('getPreferredMimeType', () => {
  it('returns audio/mp4 when supported', () => {
    (MediaRecorder.isTypeSupported as ReturnType<typeof vi.fn>).mockImplementation(
      (t: string) => t === 'audio/mp4',
    );
    expect(getPreferredMimeType()).toBe('audio/mp4');
  });

  it('falls back to audio/webm;codecs=opus when mp4 not supported', () => {
    (MediaRecorder.isTypeSupported as ReturnType<typeof vi.fn>).mockImplementation(
      (t: string) => t === 'audio/webm;codecs=opus',
    );
    expect(getPreferredMimeType()).toBe('audio/webm;codecs=opus');
  });

  it('falls back to audio/webm as last resort', () => {
    (MediaRecorder.isTypeSupported as ReturnType<typeof vi.fn>).mockImplementation(
      (t: string) => t === 'audio/webm',
    );
    expect(getPreferredMimeType()).toBe('audio/webm');
  });

  it('throws when no format is supported', () => {
    (MediaRecorder.isTypeSupported as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(() => getPreferredMimeType()).toThrow();
  });
});

describe('AudioRecorder', () => {
  let recorder: AudioRecorder;

  beforeEach(() => {
    recorder = new AudioRecorder();
  });

  it('is initially idle', () => {
    expect(recorder.getState().status).toBe('idle');
  });

  it('transitions to recording state after start()', async () => {
    await recorder.start();
    expect(recorder.getState().status).toBe('recording');
  });

  it('requests microphone access via getUserMedia', async () => {
    await recorder.start();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('transitions to paused state after pause()', async () => {
    await recorder.start();
    recorder.pause();
    expect(recorder.getState().status).toBe('paused');
  });

  it('transitions back to recording state after resume()', async () => {
    await recorder.start();
    recorder.pause();
    recorder.resume();
    expect(recorder.getState().status).toBe('recording');
  });

  it('starts MediaRecorder with 1-second timeslice for emergency save support', async () => {
    await recorder.start();
    const mockMR = (recorder as unknown as { mediaRecorder: typeof MediaRecorder & { start: ReturnType<typeof vi.fn> } }).mediaRecorder;
    expect(mockMR.start).toHaveBeenCalledWith(1000);
  });

  it('stop() returns audio data and duration', async () => {
    await recorder.start();

    // Simulate data available event
    const mockMR = (recorder as unknown as { mediaRecorder: { ondataavailable: ((e: { data: Blob }) => void) | null; stop: ReturnType<typeof vi.fn> } }).mediaRecorder;

    // Trigger ondataavailable
    mockMR.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/mp4' }) });

    const result = await recorder.stop();
    expect(result).not.toBeNull();
    expect(result!.mimeType).toContain('audio/');
    expect(typeof result!.duration).toBe('number');
    expect(result!.audio).toBeInstanceOf(ArrayBuffer);
  });

  it('elapsed timer does not count paused time', async () => {
    vi.useFakeTimers();
    await recorder.start();
    vi.advanceTimersByTime(3000); // 3s recording
    recorder.pause();
    vi.advanceTimersByTime(2000); // 2s paused
    recorder.resume();
    vi.advanceTimersByTime(1000); // 1s more recording

    const elapsed = recorder.getState().elapsed;
    // Should be approximately 4 seconds (not 6)
    expect(elapsed).toBeGreaterThanOrEqual(3.9);
    expect(elapsed).toBeLessThan(4.5);
    vi.useRealTimers();
  });

  it('emergencySave returns assembled audio from collected chunks', async () => {
    await recorder.start();

    const mockMR = (recorder as unknown as { mediaRecorder: { ondataavailable: ((e: { data: Blob }) => void) | null } }).mediaRecorder;
    mockMR.ondataavailable?.({ data: new Blob(['chunk1'], { type: 'audio/mp4' }) });
    mockMR.ondataavailable?.({ data: new Blob(['chunk2'], { type: 'audio/mp4' }) });

    const result = await recorder.emergencySave();
    expect(result).not.toBeNull();
    expect(result!.audio).toBeInstanceOf(ArrayBuffer);
    expect(result!.audio.byteLength).toBeGreaterThan(0);
  });

  it('emergencySave returns null when no chunks collected', async () => {
    const result = await recorder.emergencySave();
    expect(result).toBeNull();
  });

  it('destroy() stops stream tracks and cleans up', async () => {
    await recorder.start();
    recorder.destroy();
    expect(recorder.getState().status).toBe('idle');
  });
});
