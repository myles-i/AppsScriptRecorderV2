/**
 * Fake audio blobs and ArrayBuffers for testing.
 */

/** Returns a small non-zero ArrayBuffer that simulates audio data. */
export function makeFakeAudioBuffer(byteLength = 1024): ArrayBuffer {
  const buf = new ArrayBuffer(byteLength);
  const view = new Uint8Array(buf);
  for (let i = 0; i < byteLength; i++) {
    view[i] = i % 256;
  }
  return buf;
}

/** Returns a fake Blob representing audio of the given MIME type. */
export function makeFakeAudioBlob(mimeType = 'audio/mp4', byteLength = 1024): Blob {
  return new Blob([makeFakeAudioBuffer(byteLength)], { type: mimeType });
}

/** Returns a base64 string for a fake audio buffer. */
export function makeFakeAudioBase64(byteLength = 128): string {
  const buf = makeFakeAudioBuffer(byteLength);
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
