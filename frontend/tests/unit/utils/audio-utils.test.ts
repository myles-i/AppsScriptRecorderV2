import { describe, it, expect } from 'vitest';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../../src/utils/audio-utils';
import { makeFakeAudioBuffer } from '../../mocks/audio';

describe('arrayBufferToBase64', () => {
  it('encodes an ArrayBuffer to a base64 string', () => {
    const buf = makeFakeAudioBuffer(16);
    const b64 = arrayBufferToBase64(buf);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
    // Base64 only has valid characters
    expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('produces correct length (ceil(n/3)*4)', () => {
    const buf = makeFakeAudioBuffer(12);
    const b64 = arrayBufferToBase64(buf);
    expect(b64.length).toBe(16); // 12 bytes → 16 base64 chars
  });
});

describe('base64ToArrayBuffer', () => {
  it('decodes back to the original bytes', () => {
    const original = makeFakeAudioBuffer(32);
    const b64 = arrayBufferToBase64(original);
    const decoded = base64ToArrayBuffer(b64);

    expect(decoded.byteLength).toBe(32);
    const origView = new Uint8Array(original);
    const decodedView = new Uint8Array(decoded);
    for (let i = 0; i < 32; i++) {
      expect(decodedView[i]).toBe(origView[i]);
    }
  });

  it('round-trips arbitrary buffers', () => {
    for (const size of [1, 7, 64, 255, 1024]) {
      const buf = makeFakeAudioBuffer(size);
      const result = base64ToArrayBuffer(arrayBufferToBase64(buf));
      expect(result.byteLength).toBe(size);
    }
  });
});
