import { describe, it, expect, vi } from 'vitest';
import { resampleTo16kMono } from '../../../src/transcription/resample';

// OfflineAudioContext is mocked in setup.ts

describe('resampleTo16kMono', () => {
  it('returns a Float32Array', async () => {
    const result = await resampleTo16kMono(new ArrayBuffer(64));
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('decodes the audio data before resampling', async () => {
    await resampleTo16kMono(new ArrayBuffer(64));
    const firstInstance = (OfflineAudioContext as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(firstInstance.decodeAudioData).toHaveBeenCalled();
  });

  it('creates the output context at 16 kHz mono', async () => {
    await resampleTo16kMono(new ArrayBuffer(64));
    // Second OfflineAudioContext call is the render context
    expect(OfflineAudioContext).toHaveBeenCalledWith(1, expect.any(Number), 16000);
  });

  it('sizes the output context to match the decoded duration at 16 kHz', async () => {
    // Setup mock returns decoded.duration = 5 (see setup.ts)
    await resampleTo16kMono(new ArrayBuffer(64));
    const expectedFrames = Math.ceil(5 * 16000); // 80000
    expect(OfflineAudioContext).toHaveBeenCalledWith(1, expectedFrames, 16000);
  });

  it('connects the buffer source and starts rendering', async () => {
    await resampleTo16kMono(new ArrayBuffer(64));
    const renderInstance = (OfflineAudioContext as unknown as ReturnType<typeof vi.fn>).mock.results[1].value;
    const source = renderInstance.createBufferSource();
    expect(source.connect).toHaveBeenCalled();
    expect(source.start).toHaveBeenCalled();
    expect(renderInstance.startRendering).toHaveBeenCalled();
  });

  it('passes a copy of the audio data to decodeAudioData (does not mutate original)', async () => {
    const original = new ArrayBuffer(64);
    await resampleTo16kMono(original);
    // original should still be usable (not transferred/detached)
    expect(original.byteLength).toBe(64);
  });
});
